import { useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'

const MAX_ROWS = 8
const LINE_HEIGHT = 20 // px, matches CSS

export function TextInput() {
  const { draftText, setDraftText, activeSessionId, uiMode, setTextInputFocused, keyboardActive } = useAppStore()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = LINE_HEIGHT * MAX_ROWS
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [draftText])

  // Blur textarea when leaving terminal mode (prevents virtual keyboard)
  useEffect(() => {
    if (uiMode !== 'terminal') {
      inputRef.current?.blur()
    }
  }, [uiMode])

  // Focus/blur textarea when keyboard toggle changes
  useEffect(() => {
    if (keyboardActive) {
      inputRef.current?.focus()
    } else {
      inputRef.current?.blur()
    }
  }, [keyboardActive])

  // Send text then Enter as two separate PTY writes so Claude Code's TUI
  // processes the text first, then receives CR as a distinct "Enter" keystroke.
  // If draft is empty, send bare Enter to submit whatever is in Claude's inner input.
  const handleSend = useCallback(async () => {
    if (!activeSessionId) return
    const text = draftText.trim()
    if (!text) {
      try {
        await invoke('pty_write', { sessionId: activeSessionId, data: '\r' })
      } catch (e) {
        console.error('Failed to send enter:', e)
      }
      return
    }
    try {
      await invoke('pty_write', { sessionId: activeSessionId, data: text })
      await new Promise((r) => setTimeout(r, 50))
      await invoke('pty_write', { sessionId: activeSessionId, data: '\r' })
      setDraftText('')
    } catch (e) {
      console.error('Failed to send:', e)
    }
  }, [draftText, activeSessionId, setDraftText])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  if (!activeSessionId) return null

  return (
    <div className="text-input-bar">
      <textarea
        ref={inputRef}
        className="text-input"
        inputMode={keyboardActive ? 'text' : 'none'}
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setTextInputFocused(true)}
        onBlur={() => setTextInputFocused(false)}
        placeholder="Type a message or use voice..."
        rows={1}
      />
    </div>
  )
}
