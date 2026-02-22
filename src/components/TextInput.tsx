import { useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'

const MAX_ROWS = 8
const LINE_HEIGHT = 20 // px, matches CSS

export function TextInput() {
  const { draftText, setDraftText, activeSessionId } = useAppStore()
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

  // Send text then Enter as two separate PTY writes so Claude Code's TUI
  // processes the text first, then receives CR as a distinct "Enter" keystroke.
  const handleSend = useCallback(async () => {
    const text = draftText.trim()
    if (!text || !activeSessionId) return
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

  return (
    <div className="text-input-bar">
      <textarea
        ref={inputRef}
        className="text-input"
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={activeSessionId ? 'Type a message or use voice...' : 'Create a session first'}
        disabled={!activeSessionId}
        rows={1}
      />
    </div>
  )
}
