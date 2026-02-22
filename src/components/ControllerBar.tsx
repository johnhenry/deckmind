import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'
import { buildClaudeCommand } from '../utils/buildClaudeCommand'

// Write data directly to the PTY, bypassing xterm.js.
async function ptyWrite(sessionId: string, data: string) {
  await invoke('pty_write', { sessionId, data })
}

// Send text then Enter as two separate PTY writes.
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
    draftText,
    setDraftText,
    sessions,
    sessionStates,
    setSessionEnded,
    setClaudeResumeId,
    setActiveSession,
    showToast,
    activeGamepadButton,
    uiMode,
    setUIMode,
  } = useAppStore()

  // Derive per-session state
  const activeState = activeSessionId ? sessionStates[activeSessionId] : undefined
  const sessionEnded = activeState?.ended ?? false
  const claudeResumeId = activeState?.resumeId ?? null

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
  const handleRestart = useCallback(async () => {
    if (!activeSessionId) return
    try {
      const claudePath = await invoke<string>('get_claude_path', {
        sessionId: activeSessionId,
      })
      const flags = await invoke<string>('get_session_flags', {
        sessionId: activeSessionId,
      })
      const cmd = buildClaudeCommand(claudePath, flags, {
        resumeId: claudeResumeId ?? undefined,
      })

      setSessionEnded(activeSessionId, false)
      setClaudeResumeId(activeSessionId, null)

      await ptyWrite(activeSessionId, cmd + '\r')
    } catch (e) {
      console.error('Failed to restart session:', e)
    }
  }, [activeSessionId, claudeResumeId, setSessionEnded, setClaudeResumeId])

  // Select: Cycle sessions
  const handleCycleSession = useCallback(() => {
    if (sessions.length <= 1) return
    const currentIdx = sessions.findIndex((s) => s.id === activeSessionId)
    const next = sessions[(currentIdx + 1) % sessions.length]
    setActiveSession(next.id)
    showToast(next.name)
  }, [sessions, activeSessionId, setActiveSession, showToast])

  // Start: Toggle Start menu
  const handleStart = useCallback(() => {
    setUIMode(uiMode === 'startMenu' ? 'terminal' : 'startMenu')
  }, [uiMode, setUIMode])

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

      {/* Select - Cycle sessions */}
      <button
        className={`controller-btn menu-btn${activeGamepadButton === 'Select' ? ' gamepad-active' : ''}`}
        onClick={handleCycleSession}
        disabled={sessions.length <= 1}
        title="Cycle sessions"
      >
        <span className="glyph">{'\u21C6'}</span>
      </button>

      <div className="controller-divider" />

      {/* Start - Toggle Start menu */}
      <button
        className={`controller-btn start-btn${uiMode === 'startMenu' ? ' active' : ''}${activeGamepadButton === 'Start' ? ' gamepad-active' : ''}`}
        onClick={handleStart}
        title="Start menu"
      >
        <span className="glyph">{'\u2630'}</span>
        <span className="label">Start</span>
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
