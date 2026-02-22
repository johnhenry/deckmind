import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'

// Write data directly to the PTY, bypassing xterm.js.
// xterm.js terminal.input() bundles all bytes into one chunk which
// Claude Code's TUI can misinterpret as paste (newlines become literal
// instead of triggering submit). Using pty_write keeps us on the same
// Rust path that xterm.js onData uses, without the batching issue.
async function ptyWrite(sessionId: string, data: string) {
  await invoke('pty_write', { sessionId, data })
}

// Send text then Enter as two separate PTY writes.
// The delay ensures Claude Code processes the text first (adds it to its
// input buffer) before receiving the carriage return as a distinct "Enter"
// keystroke, rather than treating text+CR as a single pasted block.
async function ptyWriteAndSubmit(sessionId: string, text: string) {
  await ptyWrite(sessionId, text)
  await new Promise((r) => setTimeout(r, 50))
  await ptyWrite(sessionId, '\r')
}

export function ControllerBar() {
  const {
    isRecordingVoice,
    activeSessionId,
    setRecordingVoice,
    showActionMenu,
    setShowActionMenu,
    draftText,
    setDraftText,
    sessionEnded,
    claudeResumeId,
    setSessionEnded,
    setClaudeResumeId,
    activeGamepadButton,
  } = useAppStore()

  // L1: Send Shift+Tab (ESC [ Z) to cycle Claude's permission mode
  const cycleSafetyMode = useCallback(async () => {
    if (!activeSessionId) return
    try {
      await ptyWrite(activeSessionId, '\x1b[Z')
    } catch (e) {
      console.error('Failed to cycle mode:', e)
    }
  }, [activeSessionId])

  // A: Type text into terminal then press Enter
  const handleSend = useCallback(async () => {
    const text = draftText.trim()
    if (!text || !activeSessionId) return
    try {
      await ptyWriteAndSubmit(activeSessionId, text)
      setDraftText('')
    } catch (e) {
      console.error('Failed to send:', e)
    }
  }, [draftText, activeSessionId, setDraftText])

  // B: Send Ctrl+C to interrupt (when Claude is running)
  const handleStop = useCallback(async () => {
    if (!activeSessionId) return
    try {
      await ptyWrite(activeSessionId, '\x03')
    } catch (e) {
      console.error('Failed to interrupt:', e)
    }
  }, [activeSessionId])

  // B (when session ended): Type the claude command into the shell to restart/resume.
  // The shell is still alive — we just type the command like a user would.
  // No process respawn, no session picker, no timing hacks.
  const handleRestart = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const claudePath = await invoke<string>('get_claude_path', {
        sessionId: activeSessionId,
      })

      let cmd = `${claudePath} --dangerously-skip-permissions`
      if (claudeResumeId) {
        cmd += ` --resume ${claudeResumeId}`
      }
      // Chain invisible OSC sentinel so the reader thread detects Claude exit.
      // printf emits an OSC escape sequence that xterm.js silently discards.
      cmd += `; printf '\\033]666;\\007'`

      setSessionEnded(false)
      setClaudeResumeId(null)

      await ptyWrite(activeSessionId, cmd + '\r')
    } catch (e) {
      console.error('Failed to restart session:', e)
    }
  }, [activeSessionId, claudeResumeId, setSessionEnded, setClaudeResumeId])

  // Menu: Send Escape
  const handleMenu = useCallback(async () => {
    if (!activeSessionId) return
    try {
      await ptyWrite(activeSessionId, '\x1b')
    } catch (e) {
      console.error('Failed to send escape:', e)
    }
  }, [activeSessionId])

  // R2: Voice push-to-talk
  const handleVoiceDown = useCallback(async () => {
    if (!activeSessionId) return
    setRecordingVoice(true)
    try {
      await invoke('start_voice_recording')
    } catch (e) {
      console.error('Failed to start recording:', e)
      setRecordingVoice(false)
    }
  }, [activeSessionId, setRecordingVoice])

  const handleVoiceUp = useCallback(async () => {
    if (!isRecordingVoice || !activeSessionId) return
    setRecordingVoice(false)
    try {
      const transcription = await invoke<string>('stop_voice_recording')
      if (!transcription || transcription.trim().length === 0) return
      const prefix = draftText.trim() ? draftText.trim() + ' ' : ''
      setDraftText(prefix + transcription)
    } catch (e) {
      console.error('Voice failed:', e)
    }
  }, [isRecordingVoice, activeSessionId, setRecordingVoice, setDraftText, draftText])

  return (
    <div className="controller-bar">
      {/* L1 - Cycle Claude's permission mode via Shift+Tab */}
      <button
        className={`bumper-btn mode-btn${activeGamepadButton === 'L1' ? ' gamepad-active' : ''}`}
        onClick={cycleSafetyMode}
        disabled={!activeSessionId}
        title="Cycle permission mode (Shift+Tab)"
      >
        <span className="bumper-label">L1</span>
        <span className="bumper-text">Mode</span>
      </button>

      <div className="controller-divider" />

      {/* Menu - Send Escape */}
      <button
        className={`controller-btn menu-btn${activeGamepadButton === 'Menu' ? ' gamepad-active' : ''}`}
        onClick={handleMenu}
        disabled={!activeSessionId}
        title="Escape"
      >
        <span className="glyph">{'\u2630'}</span>
        <span className="label">Menu</span>
      </button>

      <div className="controller-divider" />

      {/* B (Stop/Start/Resume) and A (Send) */}
      <div className="face-group">
        {sessionEnded ? (
          <button
            className={`controller-btn face-btn face-b${activeGamepadButton === 'B' ? ' gamepad-active' : ''}`}
            onClick={handleRestart}
            disabled={!activeSessionId}
            title={claudeResumeId ? `Resume session (${claudeResumeId})` : 'Start new Claude session'}
          >
            <span className="glyph">{'\u25B6'}</span>
            <span className="label">{claudeResumeId ? 'Resume' : 'Start'}</span>
          </button>
        ) : (
          <button
            className={`controller-btn face-btn face-b${activeGamepadButton === 'B' ? ' gamepad-active' : ''}`}
            onClick={handleStop}
            disabled={!activeSessionId}
            title="Stop / Interrupt (Ctrl+C)"
          >
            <span className="glyph">{'\u24B7'}</span>
            <span className="label">Stop</span>
          </button>
        )}
        <button
          className={`controller-btn face-btn face-a${activeGamepadButton === 'A' ? ' gamepad-active' : ''}`}
          onClick={handleSend}
          disabled={!activeSessionId || !draftText.trim()}
          title="Send message (Enter)"
        >
          <span className="glyph">{'\u24B6'}</span>
          <span className="label">Send</span>
        </button>
      </div>

      <div className="controller-divider" />

      {/* R1 - Action menu toggle */}
      <button
        className={`bumper-btn ${showActionMenu ? 'active' : ''}${activeGamepadButton === 'R1' ? ' gamepad-active' : ''}`}
        onClick={() => setShowActionMenu(!showActionMenu)}
        disabled={!activeSessionId}
        title="Actions menu"
      >
        <span className="bumper-label">R1</span>
        <span className="bumper-text">Actions{showActionMenu ? ' \u25B4' : ' \u25BE'}</span>
      </button>

      {/* R2 - Voice push-to-talk */}
      <button
        className={`bumper-btn voice-bumper ${isRecordingVoice ? 'recording' : ''}${activeGamepadButton === 'R2' ? ' gamepad-active' : ''}`}
        onMouseDown={handleVoiceDown}
        onMouseUp={handleVoiceUp}
        onMouseLeave={() => { if (isRecordingVoice) handleVoiceUp() }}
        disabled={!activeSessionId}
        title="Push-to-talk (Ctrl+Space)"
      >
        <span className="bumper-label">R2</span>
        <span className="bumper-text">{isRecordingVoice ? 'Release' : 'Voice'}</span>
      </button>
    </div>
  )
}
