import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'
import type { SemanticAction } from '../types'

export function useActions() {
  const { activeSessionId, setDraftText } = useAppStore()

  const sendAction = useCallback(
    async (action: SemanticAction) => {
      if (!activeSessionId) return

      if (action === 'interrupt') {
        try {
          await invoke('pty_write', { sessionId: activeSessionId, data: '\x03' })
        } catch (e) {
          console.error('Failed to interrupt:', e)
        }
        return
      }

      // Build the prompt and place it in the text input for review
      try {
        const prompt = await invoke<string>('build_action_prompt', { action })
        setDraftText(prompt)
      } catch (e) {
        console.error('Failed to build action prompt:', e)
      }
    },
    [activeSessionId, setDraftText]
  )

  return { sendAction }
}
