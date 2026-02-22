# DeckMind — Steam Deck AI Operator Console
**Expanded Product Requirements Document (PRD)**  
Version: 0.2 Draft  
Target Platform: Steam Deck (SteamOS / Arch Linux)  
Distribution: Non‑Steam App (Added to Steam as “Non‑Steam Game”)  

---

# 1. Vision

DeckMind turns the Steam Deck into a **handheld AI operations terminal** — a physical interface for directing an AI engineer rather than typing into a computer.

The device becomes:
> a persistent cognitive console that understands context and intent

Instead of:
- keyboard driven workflows
- mouse navigation
- launching IDEs

The user:
- presses semantic buttons
- speaks instructions
- supervises an AI operator

The Deck behaves closer to a tricorder, not a laptop.

---

# 2. Design Philosophy

## 2.1 Mental Model Shift
Traditional computer:
> User operates software

DeckMind:
> User supervises an intelligent agent operating the software

The UI should therefore feel:
- appliance‑like
- interruptible
- resumable
- conversational
- stateful

Not:
- windowed desktop software
- chat UI
- code editor

---

## 2.2 Constraints
The Steam Deck is:
- portable
- suspend/resume frequently
- gamepad‑centric
- small screen
- used casually (couch/bed/travel)

Therefore:
- interactions must be < 2 seconds
- minimal typing
- one‑hand possible
- no complex menus
- context persistence required

---

# 3. Target User Personas

## 3.1 Agentic Developer
Uses AI to operate repositories and infrastructure rather than manually editing files.

Needs:
- context recall
- explain state
- continue tasks

## 3.2 DevOps Operator
Uses Deck as portable infrastructure console.

Needs:
- investigate failures
- summarize logs
- quick fixes

## 3.3 Thinking Device User
Uses Deck as thought continuity machine.

Needs:
- “what was I doing”
- planning assistance
- project resumption

---

# 4. Core Capabilities

## 4.1 Persistent AI Session

The system runs a long‑lived Claude Code subprocess.

Properties:
- never restarted unless crash
- maintains conversational context
- accumulates working memory
- stores task thread

### Session State Includes
- cwd
- git branch
- last commands
- last error
- active goal
- inferred task

User never manually starts or stops the AI.

---

## 4.2 Semantic Hardware Actions

Controller inputs map to agent behaviors.

| Action | Intent |
|------|------|
Explain | Understand current state |
Fix | Diagnose & repair |
Continue | Resume last task |
Plan | Decide next steps |
Summarize | Summarize recent activity |
Context | What am I doing |
Interrupt | Stop agent |
Voice | Freeform instruction |

Buttons represent meaning — not key presses.

---

## 4.3 Context Awareness

Every action injects environment context:

Collected automatically:
- last 20 shell commands
- exit codes
- git diff
- modified files
- running processes (optional)
- network ports (optional)

Purpose:
> eliminate prompt engineering burden from user

---

## 4.4 Push‑to‑Talk Voice

Flow:

Hold button → record → local speech‑to‑text → Claude → response

No wake word
No always listening

Target latency:
< 2 seconds

---

## 4.5 Safety Modes

| Mode | Behavior |
|----|----|
Observe | Explanation only |
Suggest | Show commands |
Confirm | Require approval |
Auto | Execute immediately |

Default: Confirm

---

# 5. User Interaction Model

## 5.1 Primary Interaction Loop

1. User picks up Deck
2. Presses Context
3. System explains current task
4. User presses Continue or speaks
5. AI proceeds
6. User interrupts or approves

The user never navigates a filesystem manually unless desired.

---

## 5.2 Example Scenarios

### Resume Work
Press Context:
> “You were debugging a failing test in the auth module...”

Press Continue

---

### Debug Failure
Command fails
Press Fix

---

### Freeform Command
Hold voice:
> “Investigate why the server is using 100% CPU”

---

# 6. Technical Architecture

## 6.1 High Level

Controller → Input Layer → Action Router → Session Manager → Claude → Output Renderer

Voice:
Mic → Recorder → Whisper → Action Router

---

## 6.2 Application Stack

Frontend: Tauri Web UI  
Backend: Rust services  
AI Engine: Claude Code CLI  
Speech: whisper.cpp local model  

---

## 6.3 Modules

### Input Listener
Reads evdev/gamepad events

### Action Router
Maps button → prompt template

### Session Manager
Maintains persistent subprocess

### Context Collector
Gathers environment data

### Claude Adapter
Streams prompts/responses

### Voice Engine
Records + transcribes audio

### UI Renderer
Displays streaming text

---

## 6.4 Claude Invocation

Persistent session model:
stdin/stdout streaming

Never stateless calls.

---

# 7. Prompt Strategy

Each action uses structured prompt templates.

Example: Explain

User intent:
Understand current task

Prompt skeleton:
You are supervising a shell session.
Directory: {cwd}
Recent commands:
{history}
Explain what the user is attempting to accomplish.

---

# 8. Storage

Local only:

~/.deckmind/
  memory.json
  session.log
  config.yaml

No accounts
No telemetry

---

# 9. Configuration

YAML driven mappings

Users can remap buttons and providers.

---

# 10. Performance Targets

Button response: <300ms  
Voice round trip: <2s  
Idle memory: <200MB  

---

# 11. Failure Behavior

If AI unavailable:
Fallback to terminal mode

If mic unavailable:
Disable voice action

---

# 12. Packaging & Distribution

Formats:
- AppImage
- Flatpak

Installed and added to Steam as Non‑Steam Game

No Steamworks required.

---

# 13. Future Extensions

Multi agent orchestration  
Offline models  
Memory graph visualization  
Shared sessions  

---

# 14. Success Criteria

User resumes complex engineering task within 10 seconds after picking up Deck.

---

# 15. Product Identity

DeckMind is not a coding assistant.
It is a portable cognitive interface for supervising intelligent software agents.
