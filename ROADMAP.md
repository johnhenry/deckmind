# DeckMind Roadmap

## Implemented

### Core Architecture
- [x] Tauri 2 app scaffold (Rust backend + React frontend)
- [x] Borderless window with game-like cyber UI theme
- [x] Zustand state management
- [x] Vite + TypeScript build pipeline

### Session Management
- [x] Persistent Claude Code CLI subprocess via PTY (portable-pty)
- [x] Multi-session support with tabbed UI
- [x] Session create / close / list
- [x] Streaming PTY output to frontend via Tauri events
- [x] Session interrupt (SIGINT)
- [x] `--dangerously-skip-permissions` to bypass trust dialog
- [x] `CLAUDECODE` env var removal for nested session prevention

### Terminal
- [x] xterm.js terminal emulator (full TUI rendering, colors, cursor positioning)
- [x] WebGL renderer for performance (with canvas fallback)
- [x] Bidirectional PTY I/O (xterm keyboard input to PTY, PTY output to xterm)
- [x] Auto-fit terminal to container on resize
- [x] 10,000 line scrollback buffer

### Semantic Actions
- [x] 8 semantic action buttons: Context, Explain, Fix, Continue, Plan, Summarize, Stop, Voice
- [x] Prompt templates with `{context}` placeholder injection
- [x] Action router that builds prompts from action + environment context
- [x] Action logging to storage

### Context Awareness
- [x] Environment context collector: cwd, git branch, git diff, modified files, shell history
- [x] Automatic context injection into every action prompt

### Voice Engine
- [x] Push-to-talk recording with cpal (cross-platform audio input)
- [x] Local speech-to-text with whisper-rs (whisper.cpp bindings)
- [x] Audio resampling to 16kHz mono (whisper requirement)
- [x] Dedicated recorder thread (solves cpal::Stream Send+Sync constraint)
- [x] Voice button in action bar with mouseDown/mouseUp handlers
- [x] Recording elapsed time overlay
- [x] Voice transcription populates draft text input for review before sending

### Input
- [x] Ctrl+1 through Ctrl+6 mapped to semantic actions
- [x] Escape mapped to interrupt
- [x] Ctrl+Space for push-to-talk (hold to record, release to send)
- [x] Free-text input bar with send button
- [x] Direct typing into xterm.js terminal

### Configuration
- [x] YAML config file at `~/.deckmind/config.yaml`
- [x] Auto-created with defaults on first run
- [x] Configurable: claude path, safety mode, whisper model, theme, working dir, voice toggle
- [x] Configurable button mappings (keyboard + gamepad)
- [x] Get/update config via Tauri commands
- [x] Settings panel UI component

### Safety Modes
- [x] 4 safety modes: Observe, Suggest, Confirm (default), Auto
- [x] Get/set safety mode via Tauri commands
- [x] Safety mode persisted in config

### Storage
- [x] Local-only storage at `~/.deckmind/`
- [x] In-memory storage manager with action logging
- [x] No accounts, no telemetry

---

## Not Yet Implemented

### High Priority

- [ ] **Session isolation via `--session-id`** - Pass unique session IDs to Claude Code so multiple sessions don't share conversation state (emdash pattern)
- [ ] **Session resume (`-c -r`)** - Resume previous Claude Code conversations instead of starting fresh every time
- [ ] **PATH fixing at startup** - GUI apps don't inherit shell PATH; need to detect Homebrew, nvm, npm global paths so `claude` CLI is findable (emdash does this aggressively)
- [ ] **Provider status detection** - Check if Claude Code CLI is installed and available at startup, show clear error if not (emdash's `ConnectionsService`)
- [ ] **Whisper model auto-download** - Prompt user or auto-download model on first voice use instead of requiring manual curl
- [ ] **Safety mode enforcement** - Observe/Suggest/Confirm modes currently stored but not enforced in the action pipeline (commands are always sent through)
- [ ] **Error fallback UI** - Show inline errors when Claude CLI is not found or session spawn fails
- [ ] **Terminal snapshot persistence** - Serialize xterm.js terminal state to disk, restore on reconnect (emdash uses `@xterm/addon-serialize`)
- [ ] **Session persistence across app restart** - Sessions are lost when the app closes; reconnect or restore from snapshot

### Medium Priority — Core Features (from Emdash)

- [ ] **SQLite database** - Replace in-memory storage with persistent SQLite (projects, tasks, conversations, messages) using Drizzle ORM or rusqlite
- [ ] **Project concept** - Associate sessions with project directories; remember per-project settings and history
- [ ] **Multi-provider support** - Provider registry pattern from emdash; support Codex, Gemini, Amp, Goose, etc. alongside Claude Code
- [ ] **Git worktree per task** - Isolate parallel agent work in separate git worktrees so agents never interfere with each other
- [ ] **Diff viewer** - Monaco-based side-by-side diff viewer for reviewing agent file changes before accepting
- [ ] **Line comments on diffs** - Annotate specific lines in the diff view, inject comments back to the agent
- [ ] **File changes panel** - Sidebar showing which files the agent modified, with git status
- [ ] **Activity detection** - Detect when agent is "busy" vs idle based on terminal output patterns (drive spinner indicators)
- [ ] **PR generation** - Auto-generate PR title and description from git diff + commits using the agent
- [ ] **Issue integration** - Pull tasks from GitHub Issues, Linear, or Jira and hand off to an agent
- [ ] **Browser preview** - Built-in webview for previewing local dev server output (auto-detect ports 3000, 5173, 8080, etc.)

### Medium Priority — UX

- [ ] **Gamepad input (evdev/SDL or Gamepad API)** - Web Gamepad API for gamepad detection and input polling in the webview
- [ ] **Controller mapping system** - Full Steam Deck / gamepad layout:
  - R1: Open semantic action menu (Context, Explain, Fix, Continue, Plan, Summarize)
  - R2 (hold): Push-to-talk voice recording
  - L1: Cycle safety modes (Observe > Suggest > Confirm > Auto)
  - A: Submit / confirm / send message
  - B: Stop / interrupt / cancel / back
  - X: Quick Fix (direct shortcut)
  - Y: Continue (direct shortcut)
  - D-pad Up/Down: Switch sessions
  - D-pad Left/Right: Navigate UI panels
  - Left Stick: Scroll terminal
  - Select: Open settings
  - Start: New session
  - Left Trackpad: Mouse cursor emulation
  - Right Trackpad: Text input cursor / scroll
- [ ] **Action menu overlay** - R1-activated radial or dropdown menu for picking semantic actions via D-pad or face buttons
- [ ] **Command palette** - Quick-access command palette (Cmd+K / controller combo) for navigation and actions
- [ ] **Settings panel wiring** - SettingsPanel component exists but form inputs are not connected to config read/write
- [ ] **Session naming and renaming** - Sessions get auto-generated names; allow user-provided names
- [ ] **Working directory picker** - Allow selecting working directory per session from the UI
- [ ] **Process health monitoring** - Detect when Claude subprocess crashes and offer restart; auto-respawn shell after agent exits
- [ ] **Confirm mode approval UI** - When in Confirm safety mode, show proposed commands and approve/reject buttons
- [ ] **Storage persistence to disk** - memory.json and session.log written to disk (currently in-memory only)
- [ ] **Notification sounds** - Audio feedback for action completion, errors, voice start/stop
- [ ] **Desktop notifications** - Notify when agent finishes a task (when app is not focused)

### Lower Priority

- [ ] **Theme switching** - Config has `theme` field but only the cyber theme exists; add light, dark, dark-black themes
- [ ] **Custom prompt template editing** - Allow users to edit action prompt templates from the UI or config
- [ ] **Per-provider flag customization** - Override CLI path, resume flags, auto-approve flags per provider (emdash's `providerConfigs`)
- [ ] **Running process detection** - Context collector could include running processes and open network ports
- [ ] **Session export** - Export conversation history to file
- [ ] **Window drag handle** - Borderless window needs a custom drag region for repositioning
- [ ] **Tray icon / background mode** - Minimize to system tray, keep sessions alive
- [ ] **Kanban board** - Drag-and-drop board view for organizing tasks (idle/running/done columns)
- [ ] **Monaco code editor** - Full file editor mode for browsing and editing worktree files
- [ ] **Lifecycle scripts** - Per-project setup/run/teardown scripts (`.deckmind.json` config)
- [ ] **Skills system** - Install reusable agent skill modules from a catalog (agentskills.io standard)
- [ ] **Keystroke injection** - For providers that don't support CLI prompt flags, type the prompt into the terminal after startup
- [ ] **Link click confirmation** - Intercept clickable URLs in terminal output, show confirmation before opening

### Steam Deck Specific

- [ ] **SteamOS packaging** - AppImage or Flatpak build for SteamOS
- [ ] **Add as Non-Steam Game** - Steam shortcut with controller config
- [ ] **Steam Input API** - Native controller mapping through Steam
- [ ] **Fullscreen / TV-friendly layout** - Optimized for 1280x800 Steam Deck screen
- [ ] **On-screen keyboard integration** - SteamOS virtual keyboard for text input
- [ ] **Suspend/resume handling** - Graceful session pause and reconnect on sleep/wake

### Advanced (from Emdash + PRD)

- [ ] **Multi-agent orchestration** - Run multiple AI agents in parallel on different tasks, each in isolated worktrees
- [ ] **Best-of-N** - Run multiple agents (same or different providers) on the same task, pick the best result
- [ ] **SSH remote development** - Connect to remote servers, run agents on remote codebases
- [ ] **Worktree pool** - Pre-create reserve git worktrees for instant task creation (eliminates 3-7s wait)
- [ ] **GitHub integration** - GitHub CLI for PR creation, check runs, PR comments, device flow auth
- [ ] **CI/CD check monitoring** - View GitHub Actions check runs and PR comments from within the app
- [ ] **Offline models** - Local LLM fallback when Claude is unavailable
- [ ] **Memory graph visualization** - Visual representation of accumulated working memory
- [ ] **Shared sessions** - Collaborative sessions between multiple users/devices
- [ ] **Auto-update** - In-app update mechanism for new releases
