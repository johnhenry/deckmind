use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty, PtyPair};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

/// OSC escape sequence used as an invisible sentinel after Claude exits.
/// OSC (Operating System Command) sequences are terminal control codes that
/// xterm.js parses but never renders as visible text. The user sees nothing.
///
/// Format: ESC ] 666 ; BEL  (private-use OSC code 666)
///
/// The shell command `printf '\033]666;\007'` emits this after Claude exits.
/// The reader thread detects it in the raw byte stream and emits `claude-exited`.
const CLAUDE_EXIT_SENTINEL: &str = "\x1b]666;\x07";

/// Direct PTY writer — no BufWriter. PTY writes go straight to the kernel
/// pseudo-terminal device, where buffering adds latency for single-byte
/// keystrokes (Escape, Enter, Ctrl+C).
pub struct PtyWriter {
    writer: Box<dyn Write + Send>,
}

impl PtyWriter {
    fn new(master: &dyn MasterPty) -> Result<Self, Box<dyn std::error::Error>> {
        let raw = master.take_writer()?;
        Ok(PtyWriter { writer: raw })
    }

    pub fn write(&mut self, data: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
        self.writer.write_all(data)?;
        self.writer.flush()?;
        Ok(())
    }
}

pub struct ClaudeProcess {
    pub pty_writer: Arc<Mutex<PtyWriter>>,
    _master: Box<dyn MasterPty + Send>,
    _child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    reader_handle: Option<thread::JoinHandle<()>>,
    alive: Arc<Mutex<bool>>,
}

impl ClaudeProcess {
    /// Spawn a shell that hosts Claude Code.
    ///
    /// Instead of running `claude` directly (which causes EOF + PTY teardown
    /// when Claude exits), we spawn the user's shell and type the claude
    /// command into it. This keeps the PTY alive across Claude restarts.
    ///
    /// The command is chained with an invisible OSC sentinel so the reader
    /// thread can detect when Claude exits without the PTY closing:
    ///
    ///   claude --dangerously-skip-permissions; printf '\033]666;\007'
    ///
    /// The printf emits an OSC escape sequence that xterm.js silently
    /// discards (invisible to the user) but the reader thread detects.
    ///
    /// The reader thread emits:
    ///   - `session-output` for all PTY data (displayed in xterm.js)
    ///   - `claude-exited` when the OSC sentinel is detected (Claude exited, shell alive)
    ///   - `session-done` on actual EOF (shell itself exited)
    pub fn spawn(
        claude_path: &str,
        working_dir: Option<&str>,
        extra_flags: &str,
        session_id: String,
        app_handle: AppHandle,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let pty_system = NativePtySystem::default();

        let pair: PtyPair = pty_system.openpty(PtySize {
            rows: 50,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        // Spawn the user's shell ($SHELL, fallback to bash)
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut cmd = CommandBuilder::new(&shell);

        if let Some(dir) = working_dir {
            cmd.cwd(dir);
        }

        // Remove CLAUDECODE so Claude doesn't think it's nested
        cmd.env_remove("CLAUDECODE");

        let child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader()?;
        let pty_writer = PtyWriter::new(pair.master.as_ref())?;
        let pty_writer = Arc::new(Mutex::new(pty_writer));

        let child = Arc::new(Mutex::new(child));
        let alive = Arc::new(Mutex::new(true));

        // Build the initial command to launch Claude inside the shell.
        // The invisible OSC sentinel fires when Claude exits, letting us
        // detect exit without PTY EOF and without any visible output.
        let flags_str = extra_flags.trim();
        let launch_cmd = if flags_str.is_empty() {
            format!(
                "{} --dangerously-skip-permissions; printf '\\033]666;\\007'\r",
                claude_path
            )
        } else {
            format!(
                "{} --dangerously-skip-permissions {}; printf '\\033]666;\\007'\r",
                claude_path, flags_str
            )
        };

        // Send the launch command to the shell after a brief delay
        // to let the shell fully initialize.
        {
            let writer_clone = pty_writer.clone();
            let cmd_bytes = launch_cmd.into_bytes();
            thread::spawn(move || {
                thread::sleep(std::time::Duration::from_millis(200));
                if let Ok(mut w) = writer_clone.lock() {
                    let _ = w.write(&cmd_bytes);
                }
            });
        }

        let reader_alive = alive.clone();
        let reader_session_id = session_id.clone();

        // Background reader thread: reads PTY output, emits Tauri events,
        // and watches for the sentinel to detect Claude exits.
        let reader_handle = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            // Accumulate partial reads to detect sentinel across chunk boundaries
            let mut pending = String::new();

            loop {
                {
                    if let Ok(flag) = reader_alive.lock() {
                        if !*flag {
                            break;
                        }
                    }
                }
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF — shell exited (full session teardown)
                        if let Ok(mut flag) = reader_alive.lock() {
                            *flag = false;
                        }
                        let _ = app_handle.emit("session-output", serde_json::json!({
                            "session_id": reader_session_id,
                            "data": "\n[Session ended]",
                        }));
                        let _ = app_handle.emit("session-done", serde_json::json!({
                            "session_id": reader_session_id,
                        }));
                        break;
                    }
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();

                        // Emit all output to the frontend for xterm.js display
                        let _ = app_handle.emit("session-output", serde_json::json!({
                            "session_id": reader_session_id,
                            "data": text,
                        }));

                        // Check for sentinel — Claude has exited but shell is alive.
                        // Accumulate text to handle sentinel split across reads.
                        pending.push_str(&text);
                        if pending.contains(CLAUDE_EXIT_SENTINEL) {
                            let _ = app_handle.emit("claude-exited", serde_json::json!({
                                "session_id": reader_session_id,
                            }));
                            pending.clear();
                        }
                        // Keep pending buffer from growing unbounded — only keep
                        // the tail long enough to catch a split sentinel.
                        if pending.len() > CLAUDE_EXIT_SENTINEL.len() * 2 {
                            let keep_from = pending.len() - CLAUDE_EXIT_SENTINEL.len();
                            pending = pending[keep_from..].to_string();
                        }
                    }
                    Err(e) => {
                        log::warn!("PTY read error for session {}: {}", reader_session_id, e);
                        if let Ok(mut flag) = reader_alive.lock() {
                            *flag = false;
                        }
                        let _ = app_handle.emit("session-done", serde_json::json!({
                            "session_id": reader_session_id,
                        }));
                        break;
                    }
                }
            }
        });

        Ok(ClaudeProcess {
            pty_writer,
            _master: pair.master,
            _child: child,
            reader_handle: Some(reader_handle),
            alive,
        })
    }

    /// Send text to the PTY stdin followed by Enter (carriage return).
    pub fn send(&self, input: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut writer = self.pty_writer.lock().map_err(|e| e.to_string())?;
        let mut data = input.as_bytes().to_vec();
        data.push(b'\r');
        writer.write(&data)?;
        Ok(())
    }

    /// Send raw bytes (e.g. Ctrl+C, Escape).
    pub fn send_raw(&self, bytes: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
        let mut writer = self.pty_writer.lock().map_err(|e| e.to_string())?;
        writer.write(bytes)?;
        Ok(())
    }

    /// Send Ctrl+C interrupt.
    pub fn send_interrupt(&self) -> Result<(), Box<dyn std::error::Error>> {
        self.send_raw(&[0x03])
    }

    #[allow(dead_code)]
    pub fn is_alive(&self) -> bool {
        self.alive.lock().map(|f| *f).unwrap_or(false)
    }

    pub fn kill(&mut self) {
        if let Ok(mut flag) = self.alive.lock() {
            *flag = false;
        }
        if let Ok(mut child) = self._child.lock() {
            let _ = child.kill();
        }
    }
}

impl Drop for ClaudeProcess {
    fn drop(&mut self) {
        self.kill();
        if let Some(handle) = self.reader_handle.take() {
            let _ = handle.join();
        }
    }
}
