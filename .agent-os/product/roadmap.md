# DeckMind Product Roadmap

> Last Updated: 2026-02-19
> Version: 1.0.0
> Status: Active Development

## Phase 0: Already Completed

The following features have been implemented:

- [x] Tauri v2 + React + xterm.js app scaffold
- [x] PTY session management (create, close, list)
- [x] xterm.js terminal rendering with WebGL
- [x] Controller bar with gamepad-style buttons (L1/R1/R2/A/B/Menu)
- [x] Two-step PTY write pattern for reliable text submission
- [x] Action menu with semantic actions (Explain, Fix, Continue, Plan, Summarize, Context)
- [x] Actions populate draft text input for review before sending
- [x] Arrow key forwarding to PTY for Claude Code TUI navigation
- [x] Auto-resizing textarea input
- [x] Voice push-to-talk (Ctrl+Space / R2) via Whisper
- [x] Keyboard shortcuts (Ctrl+1-6 for actions, Escape for interrupt)
- [x] Session restart/resume (process respawn approach) - functional but fragile

## Phase 1: Session Reliability — Shell Wrapper Architecture

**Goal:** Eliminate fragile process respawn by running Claude inside a persistent shell.
**Status:** In Progress

### Problem

The current approach spawns `claude` directly as the PTY process. When Claude exits:
1. PTY hits EOF, the reader thread terminates, xterm.js connection is severed
2. To restart, Rust must kill the dead process and spawn a fresh one (`restart_session`)
3. To resume, Rust passes `--resume <id>` which shows a session picker needing auto-Enter
4. Resume ID is parsed from raw PTY output (ANSI-polluted, chunk-boundary fragile)
5. A blind 1-second delay sends Enter to confirm the picker (timing-dependent)

This creates 5+ fragile coupling points between DeckMind and Claude Code's TUI output format.

### Solution

Spawn `bash` (or `zsh`) as the PTY process, then type `claude --dangerously-skip-permissions`
into it. When Claude exits, the shell survives — no EOF, no teardown, no process respawn.

```
Before (fragile):
  create_session  → spawn claude directly → EOF on exit → restart_session → spawn new claude
  resume          → spawn claude --resume <id> → session picker → blind Enter after 1s

After (robust):
  create_session  → spawn bash → type "claude --dangerously-skip-permissions\r"
  restart         → type "claude --dangerously-skip-permissions\r"
  resume          → type "claude --dangerously-skip-permissions --resume <id>\r"
  detect exit     → sentinel marker: "echo __DECKMIND_CLAUDE_EXITED__" chained after claude
```

### Tasks

- [x] 1.1 **Rewrite `ClaudeProcess::spawn`** to launch user's shell instead of claude directly `M`
  - Spawn `$SHELL` (fallback `bash`) as the PTY process
  - Send `claude --dangerously-skip-permissions; echo __DECKMIND_CLAUDE_EXITED__\r` to start Claude
  - Reader thread watches for `__DECKMIND_CLAUDE_EXITED__` sentinel to emit `claude-exited` event
  - PTY stays alive after Claude exits (shell is still running)
  - `session-done` only fires when the shell itself exits (session close)

- [x] 1.2 **Add `claude-exited` Tauri event** `S`
  - New event distinct from `session-done`
  - Carries `session_id` so frontend knows which session's Claude exited
  - Emitted by reader thread when sentinel detected in PTY output

- [x] 1.3 **Remove `restart_session` Rust command** `S`
  - No longer needed — restart/resume is just a `pty_write` of the claude command
  - Remove from SessionManager, lib.rs invoke_handler
  - Remove `claude_resume_id` parameter from `ClaudeProcess::spawn`

- [x] 1.4 **Store `claude_path` in SessionManager** `XS`
  - Sessions need to know the claude command to re-invoke after exit
  - Read from config on session creation, store alongside SessionInfo

- [x] 1.5 **Update frontend `useSession.ts`** `M`
  - Listen for `claude-exited` instead of `session-done` for claude exit detection
  - `session-done` remains for full session teardown (shell exit)
  - Remove ANSI-stripping regex (no longer parsing raw PTY for resume ID)

- [x] 1.6 **Update frontend `appStore.ts`** `XS`
  - Keep `sessionEnded` and `claudeResumeId`
  - `sessionEnded` now set by `claude-exited` event (not `session-done`)

- [x] 1.7 **Update `ControllerBar.tsx` restart/resume** `M`
  - Remove `invoke('restart_session')` call
  - Start: `ptyWrite(sessionId, 'claude --dangerously-skip-permissions\r')`
  - Resume: `ptyWrite(sessionId, 'claude --dangerously-skip-permissions --resume <id>\r')`
  - No more blind setTimeout, no more session picker auto-confirm
  - Read resume ID from xterm.js terminal buffer (Phase 1.8)

- [x] 1.8 **Parse resume ID from xterm.js buffer** `S`
  - On `claude-exited` event, read last ~30 lines of `term.buffer.active`
  - Use `buffer.getLine(i)?.translateToString(true)` — already ANSI-free
  - Match `claude --resume <uuid>` from clean rendered text
  - Far more reliable than parsing streaming raw PTY chunks

### What This Eliminates

| Fragile coupling | Status after Phase 1 |
|---|---|
| Process kill/respawn for restart | Eliminated — just type command |
| `--resume` session picker + blind Enter | Eliminated — CLI invocation skips picker |
| ANSI-stripping regex on raw PTY chunks | Eliminated — xterm.js buffer is clean |
| 1s setTimeout timing hack | Eliminated — no picker to confirm |
| `restart_session` Rust command | Eliminated — `pty_write` suffices |
| EOF teardown on Claude exit | Eliminated — shell survives |

### Dependencies

- None (self-contained refactor of existing session management)

---

## Phase 2: Future Improvements (Planned)

### 2.1 Multi-session tab management
- Tab bar for switching between concurrent Claude sessions
- Each tab has its own terminal + state
- Session list in sidebar

### 2.2 Gamepad physical controller support
- Map Xbox/PlayStation controller buttons to actions
- D-pad for TUI navigation
- Analog sticks for scrolling

### 2.3 Session persistence across app restarts
- Save session state to disk
- Resume Claude sessions on app launch
- Remember working directory per session

### 2.4 Custom action templates
- User-defined prompt templates
- Configurable action menu
- Import/export action sets

---

## Effort Scale

- XS: < 1 hour
- S: 1-3 hours
- M: 3-8 hours
- L: 1-2 days
- XL: 3+ days
