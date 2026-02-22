import { useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useActions } from './useActions'
import { useAppStore } from '../stores/appStore'
import type { SemanticAction } from '../types'

const KEY_ACTION_MAP: Record<string, SemanticAction> = {
  'ctrl+1': 'context',
  'ctrl+2': 'explain',
  'ctrl+3': 'fix',
  'ctrl+4': 'continue',
  'ctrl+5': 'plan',
  'ctrl+6': 'summarize',
}

export function useKeyboard() {
  const { sendAction } = useActions()
  const { setRecordingVoice, isRecordingVoice, activeSessionId, setBusy, setDraftText, draftText, setShowActionMenu, showActionMenu } = useAppStore()

  const handleVoiceStop = useCallback(async () => {
    setRecordingVoice(false)
    if (!activeSessionId) return

    try {
      const transcription = await invoke<string>('stop_voice_recording')
      if (!transcription || transcription.trim().length === 0) return

      const prefix = draftText.trim() ? draftText.trim() + ' ' : ''
      setDraftText(prefix + transcription)
    } catch (e) {
      console.error('Voice transcription failed:', e)
      setBusy(false)
    }
  }, [activeSessionId, setRecordingVoice, setBusy, setDraftText, draftText])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inTextInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT'

      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.shiftKey) parts.push('shift')
      if (e.altKey) parts.push('alt')

      const key = e.key.toLowerCase()
      if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
        parts.push(key)
      }

      const combo = parts.join('+')

      // Escape: close action menu if open, otherwise interrupt
      if (key === 'escape') {
        e.preventDefault()
        if (showActionMenu) {
          setShowActionMenu(false)
        } else if (activeSessionId) {
          invoke('pty_write', { sessionId: activeSessionId, data: '\x03' }).catch((err) =>
            console.error('Failed to interrupt:', err)
          )
        }
        return
      }

      // Voice: Ctrl+Space hold to record (works everywhere)
      if (combo === 'ctrl+ ' || combo === 'ctrl+space') {
        e.preventDefault()
        if (!isRecordingVoice) {
          setRecordingVoice(true)
          invoke('start_voice_recording').catch((err) =>
            console.error('Failed to start recording:', err)
          )
        }
        return
      }

      // Don't intercept other shortcuts when focused in text input
      if (inTextInput) return

      // Arrow keys → forward to PTY for Claude Code TUI navigation
      const ARROW_SEQUENCES: Record<string, string> = {
        arrowup: '\x1b[A',
        arrowdown: '\x1b[B',
        arrowright: '\x1b[C',
        arrowleft: '\x1b[D',
      }
      const arrowSeq = ARROW_SEQUENCES[key]
      if (arrowSeq && activeSessionId) {
        e.preventDefault()
        invoke('pty_write', { sessionId: activeSessionId, data: arrowSeq }).catch((err) =>
          console.error('Failed to send arrow key:', err)
        )
        return
      }

      // Ctrl+1-6: Semantic actions
      const action = KEY_ACTION_MAP[combo]
      if (action) {
        e.preventDefault()
        sendAction(action)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Space') && isRecordingVoice) {
        handleVoiceStop()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [sendAction, isRecordingVoice, setRecordingVoice, handleVoiceStop, showActionMenu, setShowActionMenu, activeSessionId])
}
