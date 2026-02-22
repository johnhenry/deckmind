# DeckMind

A handheld AI operations terminal. DeckMind turns the Steam Deck (or any desktop) into a persistent cognitive console for supervising AI coding agents through semantic actions, voice commands, and controller input — no keyboard required.

Built with Tauri 2, Rust, React, xterm.js, and whisper.cpp.

Inspired by [Emdash](https://github.com/generalaction/emdash) — DeckMind aims to be a controller-first multi-agent coding orchestrator.

## Prerequisites

- **Rust** 1.75+ with `cargo`
- **Node.js** 22+ with `npm`
- **Tauri CLI** (`cargo install tauri-cli` and `npm install -g @tauri-apps/cli`)
- **Claude Code CLI** installed and available on PATH (`claude`)
- **Whisper model** (optional, for voice) — see [Voice Setup](#voice-setup)

### Platform-specific

**Linux (Debian/Ubuntu):**
```
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  libasound2-dev
```

**Linux (SteamOS/Arch):**
```
sudo pacman -S webkit2gtk-4.1 base-devel alsa-lib
```

**macOS:**
```
xcode-select --install
```

## Installation

```
git clone <repo-url> deckmind
cd deckmind
npm install
```

Build the Rust backend (first build downloads and compiles all crates):
```
cd src-tauri && cargo build
```

## Running

### Development mode

```
npm run tauri dev
```

This starts both the Vite dev server (hot reload) and the Tauri Rust backend.

### Production build

```
npm run tauri build
```

The bundled application will be in `src-tauri/target/release/bundle/`.

### Steam Deck

All builds run inside the `deckmind-dev` distrobox (Arch Linux). The host SteamOS filesystem is read-only.

```bash
distrobox enter deckmind-dev -- bash -c "cd ~/Projects/deckmind && npm run tauri dev"
```

The distrobox needs `systemd-libs` (for libudev), `pipewire-alsa` (for mic capture), and standard Rust/Node toolchains.

## Usage

### Sessions

Press **Start** to open the Start Menu, then select **New Session**. Each session spawns an independent shell with Claude Code running in its own PTY. Multiple sessions can run simultaneously — cycle between them with **Select** or switch via the Start Menu.

The New Session dialog has four fields navigable with DPad:
- **Name** — optional session name (R2 for voice-to-text)
- **Directory** — cycle recent dirs with DPad Left/Right, or press **Y** to browse the filesystem
- **Worktree** — toggle DPad Left/Right to isolate work in a git worktree (`--worktree`)
- **Create** — press **A** to create, or **Y** to create and continue the last conversation (`--continue`)

When Claude exits, the shell survives. Press **B** to restart or resume Claude in the same shell. Press **Y** to continue the last conversation with `--continue`.

### Start Menu

The Start Menu (Start button or hamburger icon) is the central hub:

- **New Session** — create a session with directory browser, worktree, and continue options
- **Resume Session** — resume a Claude conversation by ID (appears when Claude has exited)
- **Sessions** — switch between active sessions (X to close)
- **Actions** — semantic action prompts (Context, Explain, Fix, etc.)
- **Settings** — safety mode, voice, model (default/sonnet/opus/haiku), effort (default/low/medium/high)

Navigate with DPad, select with A, close with B.

### Semantic Actions

Actions inject environment context (git state, recent commands, cwd) into structured prompts. They populate the draft text bar for review before sending.

| Action | Shortcut | Description |
|--------|----------|-------------|
| Context | Ctrl+1 | "What am I doing?" — explains current task |
| Explain | Ctrl+2 | Understand current state |
| Fix | Ctrl+3 | Diagnose and repair errors |
| Continue | Ctrl+4 | Resume the last task |
| Plan | Ctrl+5 | Decide next steps |
| Summarize | Ctrl+6 | Summarize recent activity |
| Stop | Escape | Interrupt the AI agent |
| Voice | Ctrl+Space | Hold to record, release to transcribe |

### Draft Overlay

When draft text is queued, a translucent overlay appears at the bottom of the terminal showing a preview. This lets you see what you're about to send without looking away from the terminal output.

### Voice

Hold R2 (or Ctrl+Space) to record. Release to transcribe locally with whisper.cpp. Transcription populates the draft text for review before sending. No cloud STT, no always-listening.

### Safety Modes

Cycle with L1 (sends Shift+Tab to Claude) or toggle via the Start Menu.

| Mode | Behavior |
|------|----------|
| Observe | Explanation only, no execution |
| Suggest | Shows commands but doesn't run them |
| Confirm | Requires approval before execution (default) |
| Auto | Executes immediately |

## Controller Mapping

DeckMind reads the Steam Deck controller directly via **hidraw**, bypassing Steam Input's exclusive evdev grab. Standard gamepad libraries (gilrs, SDL) do not work in Desktop Mode — DeckMind talks to the controller hardware directly.

### Terminal Mode

| Button | Running | Session Ended |
|--------|---------|---------------|
| **A** | Send draft text | Send draft text |
| **B** | Stop (Ctrl+C) | Start or Resume |
| **Y** | — | Continue (`--continue`) |
| **X** | Toggle keyboard | — |
| **L1** | Cycle safety mode (Shift+Tab) | — |
| **R1** | Send Escape | — |
| **R2** (hold) | Push-to-talk voice | — |
| **Select** | Cycle sessions | — |
| **Start** | Open Start Menu | — |
| **DPad** | Arrow keys to PTY | — |
| **Right Stick** | Scroll terminal output | — |
| **R5** | Send Tab | — |
| **L3** | Clear draft text | — |
| **R3** | Scroll to bottom | — |

### Start Menu Mode

| Button | Action |
|--------|--------|
| **DPad Up/Down** | Navigate items |
| **A** | Select / cycle setting |
| **X** | Close focused session |
| **B / Start** | Close menu |

### New Session Dialog

| Button | Action |
|--------|--------|
| **DPad Up/Down** | Move between fields |
| **DPad Left/Right** | Cycle recent dirs (field 1) / Toggle worktree (field 2) |
| **Y** | Browse filesystem (field 1) / Create with continue (field 3) |
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
| **Start** | Cancel |

## Voice Setup

DeckMind uses whisper.cpp for local speech-to-text. To enable voice:

1. Download a GGML Whisper model:
```
mkdir -p ~/.deckmind/models
curl -L -o ~/.deckmind/models/ggml-base.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

2. The default model is `base.en`. To use a different model, edit `~/.deckmind/config.yaml`:
```yaml
whisper_model: "small.en"
```

Available models (speed vs accuracy tradeoff):
| Model | Size | Notes |
|-------|------|-------|
| tiny.en | 75 MB | Fastest, lower accuracy |
| base.en | 142 MB | Default, good balance |
| small.en | 466 MB | Better accuracy |
| medium.en | 1.5 GB | High accuracy, slower |

## Configuration

All settings are stored in `~/.deckmind/config.yaml`. The file is created with defaults on first run.

```yaml
claude_path: "claude"
safety_mode: confirm
whisper_model: "base.en"
voice_enabled: true
theme: "cyber"
default_working_dir: null
```

## Project Structure

```
src/                              # React frontend
  components/
    ControllerBar.tsx               # Bottom HUD (L1/Select/Start/B/A/R2 buttons)
    DraftOverlay.tsx                # Ghost draft preview in terminal area
    MinimalStatusBar.tsx            # Top bar (session name, dir, safety badge)
    NewSessionDialog.tsx            # Session creation dialog (gamepad-navigable)
    SessionToast.tsx                # Auto-dismiss toast notification
    SessionView.tsx                 # Session container (empty state or terminal)
    StartMenu.tsx                   # Central hub (sessions, actions, settings)
    TerminalPane.tsx                # xterm.js terminal with PTY I/O
    TextInput.tsx                   # Auto-resizing draft text input bar
    VoiceIndicator.tsx              # Recording overlay
  hooks/
    useGamepad.ts                   # Gamepad event → action dispatch (hidraw events)
    useKeyboard.ts                  # Keyboard shortcuts + arrow key forwarding
    useSession.ts                   # Session CRUD + event listeners + buffer parsing
  stores/
    appStore.ts                     # Zustand state store
  types/
    index.ts                        # TypeScript type definitions
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

## Local Storage

All data stays local:

```
~/.deckmind/
  config.yaml       # User configuration
  memory.json       # Persistent memory store
  session.log       # Action log
  models/           # Whisper GGML model files
```

No accounts. No telemetry.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full list of implemented and planned features.
