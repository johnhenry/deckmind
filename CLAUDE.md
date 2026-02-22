# DeckMind — Project Context for AI Agents

## What This Is

DeckMind is a Tauri 2 desktop app that wraps Claude Code CLI in a gamepad-style controller interface. It turns the Steam Deck (or any desktop) into a persistent AI coding console with semantic actions, voice commands, and controller input.

## Tech Stack

- **Frontend:** React 19, TypeScript 5.7, Vite 6, Zustand 5
- **Backend:** Rust (Tauri 2), tokio async runtime
- **Terminal:** xterm.js v6 (`@xterm/xterm`) with WebGL addon
- **PTY:** `portable-pty` crate for subprocess management
- **Voice:** `whisper-rs` (whisper.cpp bindings) + `cpal` for audio capture (ALSA via pipewire-alsa)
- **Gamepad:** Direct hidraw reading of Steam Deck controller HID reports (bypasses Steam Input's evdev grab)
- **Config:** YAML at `~/.deckmind/config.yaml`
- **Storage:** Local-only, `~/.deckmind/` directory

## Architecture

### Shell Wrapper Pattern

Sessions spawn the user's **shell** (`$SHELL`, fallback `bash`), not Claude directly. Claude is launched by typing the command into the shell PTY. When Claude exits, the shell survives — no PTY EOF, no teardown.

```
Session lifecycle:
  create    → spawn bash → type "claude --dangerously-skip-permissions [flags]; printf '\033]666;\007'"
  restart   → type the claude command again into the same shell
  resume    → type "claude --dangerously-skip-permissions --resume <id> [flags]; printf '\033]666;\007'"
  continue  → type "claude --dangerously-skip-permissions --continue [flags]; printf '\033]666;\007'"
  close     → kill the shell process (full teardown)
```

Per-session flags (`--worktree`, `--model`, `--effort`, `--continue`) are stored in the Rust `Session` struct so restarts include the same flags. Launch-only flags (`--worktree`) are filtered out on resume/continue via the shared `buildClaudeCommand()` helper (`src/utils/buildClaudeCommand.ts`).

**Exit detection:** An invisible OSC escape sequence (`\033]666;\007`) is chained after the claude command. The Rust reader thread detects it in the raw byte stream and emits a `claude-exited` Tauri event. xterm.js silently discards the OSC — the user sees nothing.

**Events:**
- `session-output` — All PTY data (displayed in xterm.js)
- `claude-exited` — Claude process exited, shell still alive (triggers Start/Resume button)
- `session-done` — Shell itself exited (full session teardown)

### PTY Write Patterns

Claude Code's TUI has paste detection: if text + newline arrive in a single PTY read, it treats the input as pasted content (literal newlines instead of submit). The workaround:

- **Text submission:** Two-step write — text first, 50ms delay, then `\r` separately
- **Control sequences** (Escape, Ctrl+C, Shift+Tab): Single `pty_write` call, no delay needed
- **Never use `terminal.input()`** from xterm.js — it batches bytes, triggering paste detection

### Gamepad Input (Steam Deck)

Steam Input grabs exclusive access to the controller at the evdev layer in Desktop Mode, so standard gamepad libraries (`gilrs`, SDL, evdev) see no events. DeckMind reads the controller directly via **hidraw**.

The Rust gamepad thread (`input/gamepad.rs`):
1. Scans `/sys/class/hidraw/` for Valve's USB IDs (vendor `28DE`, product `1205`)
2. Opens the hidraw device that streams 64-byte HID reports
3. Decodes the button bitmask at bytes 8-11 (little-endian u32)
4. Emits `gamepad-button` Tauri events with `{ button: "A", pressed: true }`

Button bit mapping (Steam Deck HID protocol):
```
bit 0=R2  1=L2  2=R1  3=L1  4=Y  5=B  6=X  7=A
bit 8=DPadUp  9=DPadRight  10=DPadLeft  11=DPadDown
bit 12=Select  13=Steam  14=Start  15=L5  16=R5
bit 17=LeftPadClick  18=RightPadClick  22=L3  26=R3
```

The frontend `useGamepad` hook listens for these events and dispatches actions. It uses `useAppStore.getState()` snapshots (not hook state) to avoid stale closures. Multiple UI modes:
- **Terminal mode:** A=Send, B=Stop/Resume, Y=Continue(ended), R1=Escape, L1=CycleMode, R2=Voice(hold), Select=CycleSessions, Start=StartMenu, X=Keyboard, DPad=Arrows
- **Start menu mode:** DPad=Navigate, A=Select, X=CloseSession, B/Start=Close
- **New session mode:** DPad=Navigate fields, A=Create, Y=Browse(dir field)/Continue(create field), B=Back
- **Dir browser mode:** DPad=Navigate, A=Enter dir, X=Select dir, B=Up, Start=Cancel

### Resume ID Parsing

When Claude exits and offers a resume option, the resume ID is parsed from the **xterm.js terminal buffer** (not raw PTY output). The buffer is already ANSI-free rendered text, so no escape code stripping is needed. The `claude-exited` event handler reads the last 30 lines of `term.buffer.active` and matches `claude --resume <uuid>`.

## Directory Structure

```
src/                              # React frontend
  components/
    ControllerBar.tsx               # Bottom HUD (L1/Select/Start/B/A/R2 buttons)
    DirectoryBrowser.tsx            # Gamepad-navigable filesystem browser overlay
    DraftOverlay.tsx                # Ghost draft preview in terminal area
    MinimalStatusBar.tsx            # Top bar (session name, dir, safety badge)
    NewSessionDialog.tsx            # Session creation (name, dir, worktree, continue)
    SessionToast.tsx                # Auto-dismiss toast notification
    SessionView.tsx                 # Session container (empty state or terminal)
    StartMenu.tsx                   # Central hub (sessions, actions, settings)
    TerminalPane.tsx                # xterm.js terminal + PTY I/O
    TextInput.tsx                   # Auto-resizing text input bar
    VoiceIndicator.tsx              # Recording overlay
  hooks/
    useGamepad.ts                   # Physical gamepad → action dispatch via Tauri events
    useKeyboard.ts                  # Global keyboard shortcuts + arrow key forwarding
    useSession.ts                   # Session CRUD + event listeners + buffer parsing
  stores/
    appStore.ts                     # Zustand store (sessions, UI state, terminal instance)
  types/
    index.ts                        # SemanticAction, SafetyMode, SessionInfo, DirEntry, AppConfig
  utils/
    buildClaudeCommand.ts           # Shared command builder (filters --worktree on resume)
  styles/
    global.css                      # Cyber theme (dark blue, cyan accents)

src-tauri/src/                    # Rust backend
  lib.rs                            # AppState, all Tauri commands, setup
  main.rs                           # Entry point
  actions/
    router.rs                       # ActionRouter::build_prompt(action, context)
    templates.rs                    # SemanticAction enum + prompt templates
  config/
    schema.rs                       # AppConfig, SafetyMode, ButtonMapping structs
  input/
    gamepad.rs                      # Hidraw reader thread for Steam Deck controller
    keyboard.rs                     # KeyboardInput (matches key combos to actions)
  context/
    collector.rs                    # ContextCollector (git, cwd, shell history)
  session/
    manager.rs                      # SessionManager (create/close/list + writer access)
    process.rs                      # ClaudeProcess (shell spawn, reader thread, OSC sentinel)
  storage/
    memory.rs                       # In-memory action log
  voice/
    recorder.rs                     # Audio capture via cpal
    transcriber.rs                  # Whisper.cpp transcription
```

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/session/process.rs` | Shell wrapper, PTY reader thread, OSC sentinel detection |
| `src-tauri/src/session/manager.rs` | Session CRUD, stores claude_path + launch_flags per session |
| `src-tauri/src/lib.rs` | All Tauri commands (create_session, list_directory, pty_write, etc.) |
| `src/components/ControllerBar.tsx` | Stop/Start/Resume button logic, all controller buttons |
| `src/components/DirectoryBrowser.tsx` | Gamepad-navigable filesystem browser overlay |
| `src/components/NewSessionDialog.tsx` | Session creation dialog (name, dir, worktree, continue) |
| `src/components/StartMenu.tsx` | Central hub (sessions, actions, model/effort/voice settings) |
| `src/hooks/useSession.ts` | Event listeners, xterm.js buffer parsing for resume ID |
| `src/hooks/useGamepad.ts` | Gamepad event → action dispatch (terminal, startMenu, newSession, dirBrowser) |
| `src/stores/appStore.ts` | Central Zustand store |
| `src/utils/buildClaudeCommand.ts` | Shared command builder (used by 4 restart/resume/continue sites) |
| `src/components/TerminalPane.tsx` | xterm.js setup, WebGL, resize handling |
| `src-tauri/src/input/gamepad.rs` | Hidraw polling thread, Steam Deck HID button decoding |

## Tauri Commands

| Command | Purpose |
|---------|---------|
| `create_session` | Spawn shell + Claude PTY (accepts `extra_flags`) |
| `close_session` | Kill shell process |
| `pty_write` | Write string data to PTY |
| `pty_write_bytes` | Write raw bytes to PTY |
| `build_action_prompt` | Build prompt from action + context (returns string) |
| `get_claude_path` | Get claude CLI path for a session (for restart commands) |
| `get_session_flags` | Get stored launch flags for a session (for restart/continue) |
| `list_directory` | List directories in a path (for filesystem browser) |
| `get_home_dir` | Get user's home directory path |
| `interrupt_session` | Send Ctrl+C |
| `start_voice_recording` / `stop_voice_recording` | Voice capture + transcription |
| `get_config` / `update_config` | Config CRUD |
| `get_safety_mode` / `set_safety_mode` | Safety mode accessors |

## Semantic Actions

Actions populate the text input bar (draft text) for user review before sending:

| Action | Shortcut | What it does |
|--------|----------|-------------|
| Context | Ctrl+1 | "What am I doing?" — understands current task |
| Explain | Ctrl+2 | Understand current state |
| Fix | Ctrl+3 | Diagnose and repair errors |
| Continue | Ctrl+4 | Resume last task |
| Plan | Ctrl+5 | Decide next steps |
| Summarize | Ctrl+6 | Summarize recent activity |
| Stop | Escape | Sends Ctrl+C to PTY |
| Voice | Ctrl+Space | Hold to record, release to transcribe |

## Controller Bar / Gamepad Buttons

Works with both on-screen clicks and physical Steam Deck buttons (via hidraw).

### Terminal Mode

| Button | Running | Session Ended |
|--------|---------|---------------|
| **A** | Send draft text | Send draft text |
| **B** | Stop (Ctrl+C) | Start or Resume (with stored flags) |
| **Y** | — | Continue last conversation (`--continue`) |
| **X** | Toggle on-screen keyboard | — |
| **L1** | Cycle safety mode (Shift+Tab) | — |
| **R1** | Send Escape to PTY | — |
| **R2** | Push-to-talk voice (hold) | — |
| **Select** | Cycle sessions (with toast) | — |
| **Start** | Open Start Menu | — |
| **DPad** | Arrow keys to PTY | — |
| **R5** | Send Tab | — |
| **L3** | Clear draft text | — |
| **R3** | Scroll to bottom | — |

### New Session Dialog

| Button | Action |
|--------|--------|
| **DPad Up/Down** | Move between fields (name, directory, worktree, create) |
| **DPad Left/Right** | Cycle recent dirs (field 1) / Toggle worktree (field 2) |
| **Y** | Browse filesystem (field 1) / Create with `--continue` (field 3) |
| **A** | Create session (field 3) |
| **B** | Back to Start Menu |
| **R2** | Voice-to-text for session name |

### Directory Browser

| Button | Action |
|--------|--------|
| **DPad Up/Down** | Navigate entries |
| **A** | Enter directory |
| **X** | Select current directory |
| **B** | Go up one level |
| **Start** | Cancel, return to new session dialog |

## Build & Run

All builds run inside the `deckmind-dev` distrobox (Arch Linux) on the Steam Deck. The host SteamOS filesystem is read-only; the distrobox has the full toolchain.

```bash
# Dev mode (frontend + backend, hot reload)
distrobox enter deckmind-dev -- bash -c "cd ~/Projects/deckmind && npm run tauri dev"

# Rust check only
distrobox enter deckmind-dev -- bash -c "cd ~/Projects/deckmind/src-tauri && cargo check"

# TypeScript check only
distrobox enter deckmind-dev -- bash -c "cd ~/Projects/deckmind && npx tsc --noEmit"

# Production build
distrobox enter deckmind-dev -- bash -c "cd ~/Projects/deckmind && npm run tauri build"
```

A desktop shortcut exists at `~/Desktop/DeckMind.desktop` for quick dev-mode launches.

## Configuration

Config file: `~/.deckmind/config.yaml` (auto-created on first run)

```yaml
claude_path: "claude"          # Path to Claude Code CLI
safety_mode: confirm           # observe | suggest | confirm | auto
whisper_model: "base.en"       # Whisper model name
voice_enabled: true
theme: "cyber"
default_working_dir: null      # Optional default cwd for new sessions
default_model: null            # Optional: sonnet | opus | haiku (passed as --model)
default_effort: null           # Optional: low | medium | high (passed as --effort)
```

## Development Notes

- All builds run inside `deckmind-dev` distrobox — never on the host SteamOS directly
- Rust builds from `src-tauri/`, not project root (`cargo check` must run from there)
- The `--dangerously-skip-permissions` flag is always passed to Claude Code
- `CLAUDECODE` env var is removed so Claude doesn't think it's nested
- Voice requires a Whisper model at `~/.deckmind/models/ggml-<model>.bin`
- The terminal theme matches the UI cyber theme (dark blue `#0a0e17` background)
- Arrow keys are forwarded to the PTY as ANSI escape sequences when not in the text input
- The text input auto-resizes up to 8 rows based on content

### Steam Deck Platform Notes

- **Gamepad:** Steam grabs exclusive evdev access in Desktop Mode. DeckMind reads `/dev/hidraw*` directly (Valve vendor `28DE`, product `1205`) to get button events. Standard gamepad libraries (gilrs, SDL) will not work.
- **Audio:** cpal uses ALSA, which must route through PipeWire via `pipewire-alsa` (installed in distrobox). Without it, recording returns silence. The internal mic source is a PipeWire loopback device.
- **Distrobox deps:** The distrobox needs `systemd-libs` (for libudev), `pipewire-alsa` (for mic capture), and standard Rust/Node toolchains. Install with `sudo pacman -S --noconfirm systemd-libs pipewire-alsa`.
