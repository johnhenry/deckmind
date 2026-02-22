# DeckMind — Project Context for AI Agents

## What This Is

DeckMind is a Tauri 2 desktop app that wraps Claude Code CLI in a gamepad-style controller interface. It turns the Steam Deck (or any desktop) into a persistent AI coding console with semantic actions, voice commands, and controller input.

## Tech Stack

- **Frontend:** React 19, TypeScript 5.7, Vite 6, Zustand 5
- **Backend:** Rust (Tauri 2), tokio async runtime
- **Terminal:** xterm.js v6 (`@xterm/xterm`) with WebGL addon
- **PTY:** `portable-pty` crate for subprocess management
- **Voice:** `whisper-rs` (whisper.cpp bindings) + `cpal` for audio capture
- **Config:** YAML at `~/.deckmind/config.yaml`
- **Storage:** Local-only, `~/.deckmind/` directory

## Architecture

### Shell Wrapper Pattern

Sessions spawn the user's **shell** (`$SHELL`, fallback `bash`), not Claude directly. Claude is launched by typing the command into the shell PTY. When Claude exits, the shell survives — no PTY EOF, no teardown.

```
Session lifecycle:
  create  → spawn bash → type "claude --dangerously-skip-permissions; printf '\033]666;\007'"
  restart → type the claude command again into the same shell
  resume  → type "claude --dangerously-skip-permissions --resume <id>; printf '\033]666;\007'"
  close   → kill the shell process (full teardown)
```

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

### Resume ID Parsing

When Claude exits and offers a resume option, the resume ID is parsed from the **xterm.js terminal buffer** (not raw PTY output). The buffer is already ANSI-free rendered text, so no escape code stripping is needed. The `claude-exited` event handler reads the last 30 lines of `term.buffer.active` and matches `claude --resume <uuid>`.

## Directory Structure

```
src/                              # React frontend
  components/
    ActionMenu.tsx                  # R1 semantic action popup
    ControllerBar.tsx               # Bottom HUD (L1/R1/R2/A/B/Menu buttons)
    SessionTabs.tsx                 # Multi-session tab bar
    SessionView.tsx                 # Session container
    SettingsPanel.tsx               # Config UI modal
    StatusDisplay.tsx               # Safety mode badge
    TerminalPane.tsx                # xterm.js terminal + PTY I/O
    TextInput.tsx                   # Auto-resizing text input bar
    VoiceIndicator.tsx              # Recording overlay
  hooks/
    useActions.ts                   # Builds action prompts, populates draft text
    useKeyboard.ts                  # Global keyboard shortcuts + arrow key forwarding
    useSession.ts                   # Session CRUD + event listeners + buffer parsing
  stores/
    appStore.ts                     # Zustand store (sessions, UI state, terminal instance)
  types/
    index.ts                        # SemanticAction, SafetyMode, SessionInfo, AppConfig
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
| `src-tauri/src/session/manager.rs` | Session CRUD, stores claude_path per session |
| `src-tauri/src/lib.rs` | All Tauri commands (create_session, pty_write, build_action_prompt, etc.) |
| `src/components/ControllerBar.tsx` | Stop/Start/Resume button logic, all controller buttons |
| `src/hooks/useSession.ts` | Event listeners, xterm.js buffer parsing for resume ID |
| `src/stores/appStore.ts` | Central Zustand store |
| `src/components/TerminalPane.tsx` | xterm.js setup, WebGL, resize handling |

## Tauri Commands

| Command | Purpose |
|---------|---------|
| `create_session` | Spawn shell + Claude PTY |
| `close_session` | Kill shell process |
| `pty_write` | Write string data to PTY |
| `pty_write_bytes` | Write raw bytes to PTY |
| `build_action_prompt` | Build prompt from action + context (returns string) |
| `get_claude_path` | Get claude CLI path for a session (for restart commands) |
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

## Controller Bar Buttons

| Button | Normal State | Session Ended |
|--------|-------------|---------------|
| **B** | Stop (Ctrl+C) | Start or Resume |
| **A** | Send (draft text + Enter) | Send |
| **L1** | Cycle safety mode (Shift+Tab) | — |
| **R1** | Toggle action menu | — |
| **R2** | Push-to-talk voice | — |
| **Menu** | Send Escape | — |

## Build & Run

```bash
# Frontend build
npm install
npx vite build

# Rust check (from src-tauri/)
cd src-tauri && cargo check

# Dev mode (both frontend + backend)
npm run tauri dev

# Production build
npm run tauri build
```

## Configuration

Config file: `~/.deckmind/config.yaml` (auto-created on first run)

```yaml
claude_path: "claude"          # Path to Claude Code CLI
safety_mode: confirm           # observe | suggest | confirm | auto
whisper_model: "base.en"       # Whisper model name
voice_enabled: true
theme: "cyber"
default_working_dir: null      # Optional default cwd for new sessions
```

## Development Notes

- Rust builds from `src-tauri/`, not project root (`cargo check` must run from there)
- The `--dangerously-skip-permissions` flag is always passed to Claude Code
- `CLAUDECODE` env var is removed so Claude doesn't think it's nested
- Voice requires a Whisper model at `~/.deckmind/models/ggml-<model>.bin`
- The terminal theme matches the UI cyber theme (dark blue `#0a0e17` background)
- Arrow keys are forwarded to the PTY as ANSI escape sequences when not in the text input
- The text input auto-resizes up to 8 rows based on content
