# DeckMind

A handheld AI operations terminal. DeckMind turns the Steam Deck (or any desktop) into a persistent cognitive console for supervising AI coding agents through semantic actions, voice commands, and controller input — no keyboard required.

Built with Tauri 2, Rust, React, xterm.js, and whisper.cpp.

Inspired by [Emdash](https://github.com/generalaction/emdash) — DeckMind aims to be a controller-first multi-agent coding orchestrator.

## Prerequisites

- **Rust** 1.75+ with `cargo`
- **Node.js** 22+ with `npm`
- **Tauri CLI** (`cargo install tauri-cli` and `npm install -g @tauri-apps/cli`)
- **Claude Code CLI** installed and available on PATH (`claude`)
- **Whisper model** (optional, for voice) - see [Voice Setup](#voice-setup)

### Platform-specific

**macOS:**
```
xcode-select --install
```

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

## Usage

### Terminal

Each session runs a full Claude Code CLI subprocess on a PTY, rendered with xterm.js. You get complete TUI fidelity — colors, cursor positioning, progress indicators, and interactive prompts all work natively.

You can type directly into the terminal or use the text input bar below it.

### Semantic Actions

Action buttons inject environment context (git state, recent commands, cwd) into structured prompts:

| Action | Shortcut | Description |
|--------|----------|-------------|
| Context | Ctrl+1 | "What am I doing?" - explains current task |
| Explain | Ctrl+2 | Understand current state |
| Fix | Ctrl+3 | Diagnose and repair errors |
| Continue | Ctrl+4 | Resume the last task |
| Plan | Ctrl+5 | Decide next steps |
| Summarize | Ctrl+6 | Summarize recent activity |
| Stop | Escape | Interrupt the AI agent |
| Voice | Ctrl+Space | Hold to record, release to transcribe |

### Voice

Hold the Voice button (or Ctrl+Space) to record. Release to transcribe locally with whisper.cpp. Transcription populates the text input for review before sending. No cloud STT, no always-listening.

### Sessions

Click **+** in the tab bar to create a new session. Each session is an independent Claude Code PTY subprocess with its own conversation context.

### Safety Modes

Configure in the settings panel or in `~/.deckmind/config.yaml`:

| Mode | Behavior |
|------|----------|
| Observe | Explanation only, no execution |
| Suggest | Shows commands but doesn't run them |
| Confirm | Requires approval before execution (default) |
| Auto | Executes immediately |

## Controller Mapping (Planned)

DeckMind is designed for Steam Deck and gamepad-first operation:

```
              Steam Deck Layout
    ┌─────────────────────────────────────┐
    │  [L1] Mode Toggle    [R1] Actions   │
    │  [L2] (reserved)     [R2] Voice PTT │
    │                                     │
    │  [D-pad]             [A] Submit     │
    │  Navigate            [B] Stop/Back  │
    │  sessions/UI         [X] Quick Fix  │
    │                      [Y] Continue   │
    │                                     │
    │  [L-Stick]           [R-Stick]      │
    │  Terminal scroll     (reserved)     │
    │                                     │
    │  [Select] Settings   [Start] New    │
    │  [L-Trackpad] Mouse  [R-Trackpad]   │
    │                      Text cursor    │
    └─────────────────────────────────────┘
```

| Button | Action |
|--------|--------|
| **R1** | Open semantic action menu (Context, Explain, Fix, Continue, Plan, Summarize) |
| **R2** (hold) | Push-to-talk voice recording |
| **L1** | Cycle safety modes (Observe > Suggest > Confirm > Auto) |
| **A** | Submit / confirm / send message |
| **B** | Stop / interrupt / cancel / back |
| **X** | Quick Fix (direct shortcut) |
| **Y** | Continue (direct shortcut) |
| **D-pad Up/Down** | Switch between sessions |
| **D-pad Left/Right** | Navigate UI panels |
| **Left Stick** | Scroll terminal output |
| **Select** | Open settings |
| **Start** | New session |
| **Left Trackpad** | Mouse cursor emulation |
| **Right Trackpad** | Text input cursor / scroll |

## Configuration

All settings are stored in `~/.deckmind/config.yaml`. The file is created with defaults on first run.

```yaml
claude_path: "claude"
safety_mode: confirm
whisper_model: "base.en"
voice_enabled: true
theme: "cyber"
default_working_dir: null
button_mappings:
  - action: context
    keyboard: { key: "1", modifiers: ["Ctrl"] }
    gamepad: null
  - action: explain
    keyboard: { key: "2", modifiers: ["Ctrl"] }
    gamepad: null
  # ... etc
```

## Project Structure

```
deckmind/
  src/                        # React frontend
    components/
      ActionBar.tsx             # Semantic action buttons
      SessionTabs.tsx           # Multi-session tab bar
      SessionView.tsx           # Session container (empty state or terminal)
      TerminalPane.tsx          # xterm.js terminal with PTY I/O
      TextInput.tsx             # Free-text input bar with send button
      SettingsPanel.tsx         # Configuration UI
      StatusDisplay.tsx         # Session status + safety mode badge
      VoiceIndicator.tsx        # Recording overlay with elapsed time
    hooks/
      useActions.ts             # Action dispatch logic
      useKeyboard.ts            # Keyboard shortcut handler
      useSession.ts             # Session CRUD + event listeners
    stores/
      appStore.ts               # Zustand state store
    types/
      index.ts                  # TypeScript type definitions
    styles/
      global.css                # Cyber theme
  src-tauri/                  # Rust backend
    src/
      actions/                  # Semantic action router + prompt templates
      config/                   # YAML config loading/saving
      context/                  # Environment context collector (git, shell, cwd)
      input/                    # Input handling (scaffolded)
      session/                  # PTY subprocess manager + streaming output
      storage/                  # Local storage (memory.json, session.log)
      voice/                    # whisper.cpp recorder + transcriber
      lib.rs                    # App state, Tauri commands, setup
      main.rs                   # Entry point
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
