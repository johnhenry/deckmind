import { useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useActions } from './useActions'
import { useAppStore } from '../stores/appStore'
import { buildKeyboardMap } from '../utils/buttonMappings'
import type { SemanticAction } from '../types'

// Fallback map used when config hasn't loaded yet
const DEFAULT_KEY_MAP: Record<string, SemanticAction> = {
  'ctrl+1': 'context',
  'ctrl+2': 'explain',
  'ctrl+3': 'fix',
  'ctrl+4': 'continue',
  'ctrl+5': 'plan',
  'ctrl+6': 'summarize',
}

export function useKeyboard() {
  const { sendAction } = useActions()
  const { setRecordingVoice, isRecordingVoice, activeSessionId, setBusy, setDraftText, draftText } = useAppStore()
  const voiceKeyRef = useRef<string | null>(null)

  const handleVoiceStop = useCallback(async () => {
    setRecordingVoice(false)
    voiceKeyRef.current = null
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
      const state = useAppStore.getState()
      const { uiMode } = state

      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.shiftKey) parts.push('shift')
      if (e.altKey) parts.push('alt')

      const key = e.key.toLowerCase()
      if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
        parts.push(key)
      }

      const combo = parts.join('+')

      // Escape: always close overlays first
      if (key === 'escape') {
        if (uiMode === 'startMenu' || uiMode === 'newSession' || uiMode === 'remapper') {
          e.preventDefault()
          state.setUIMode('terminal')
          return
        }
      }

      // Build config-driven keyboard map (or use fallback)
      const mappings = state.config?.button_mappings
      const keyMap = mappings ? buildKeyboardMap(mappings) : DEFAULT_KEY_MAP
      const action = keyMap[combo]

      // Voice action: works in all modes (push-to-hold)
      if (action === 'voice') {
        e.preventDefault()
        if (!isRecordingVoice && activeSessionId) {
          voiceKeyRef.current = key
          setRecordingVoice(true)
          invoke('start_voice_recording').catch((err) =>
            console.error('Failed to start recording:', err)
          )
        }
        return
      }

      // Non-terminal modes: no further shortcuts
      if (uiMode !== 'terminal') return

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

      // Execute matched action from config
      if (action) {
        e.preventDefault()
        if (action === 'interrupt') {
          if (activeSessionId) {
            invoke('pty_write', { sessionId: activeSessionId, data: '\x03' }).catch((err) =>
              console.error('Failed to interrupt:', err)
            )
          }
        } else {
          sendAction(action)
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isRecordingVoice) {
        const key = e.key.toLowerCase()
        // Stop recording when the voice key is released
        if (key === voiceKeyRef.current || key === ' ') {
          handleVoiceStop()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [sendAction, isRecordingVoice, setRecordingVoice, handleVoiceStop, activeSessionId])
}
