import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useAppStore } from '../stores/appStore'
import type { SessionInfo } from '../types'

let listenerSetup = false

export function useSession() {
  const {
    sessions,
    activeSessionId,
    setSessions,
    setActiveSession,
    setBusy,
    setSessionEnded,
    setClaudeResumeId,
    clearSessionState,
  } = useAppStore()

  const setupListeners = useCallback(async () => {
    if (listenerSetup) return
    listenerSetup = true

    // Claude process exited but shell is still alive.
    // Parse the xterm.js buffer for a resume ID (already ANSI-free).
    await listen<{ session_id: string }>('claude-exited', (event) => {
      const sessionId = event.payload.session_id
      setBusy(false)
      setSessionEnded(sessionId, true)

      // Read the xterm.js terminal buffer to find the resume ID.
      const term = useAppStore.getState().terminalInstance
      if (term) {
        const buffer = term.buffer.active
        for (let i = buffer.length - 1; i >= Math.max(0, buffer.length - 30); i--) {
          const line = buffer.getLine(i)?.translateToString(true) || ''
          const match = line.match(/claude\s+--resume\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
          if (match) {
            setClaudeResumeId(sessionId, match[1])
            break
          }
        }
      }
    })

    // Shell itself exited — full session teardown
    await listen<{ session_id: string }>('session-done', (event) => {
      setBusy(false)
      setSessionEnded(event.payload.session_id, true)
    })

    // Message sent acknowledgment
    await listen<{ session_id: string; message: string }>('session-message-sent', (_event) => {
      // Message was accepted by the session
    })
  }, [setBusy, setSessionEnded, setClaudeResumeId])

  const refreshSessions = useCallback(async () => {
    try {
      const result = await invoke<SessionInfo[]>('list_sessions')
      setSessions(result)
    } catch (e) {
      console.error('Failed to list sessions:', e)
    }
  }, [setSessions])

  const createSession = useCallback(
    async (name?: string, workingDir?: string, extraFlags?: string) => {
      try {
        const session = await invoke<SessionInfo>('create_session', {
          name: name || null,
          workingDir: workingDir || null,
          extraFlags: extraFlags || null,
        })
        await refreshSessions()
        setActiveSession(session.id)
        // Track recently used directories
        if (workingDir) {
          useAppStore.getState().addRecentDir(workingDir)
        } else if (session.working_dir) {
          useAppStore.getState().addRecentDir(session.working_dir)
        }
        return session
      } catch (e) {
        console.error('Failed to create session:', e)
        throw e
      }
    },
    [refreshSessions, setActiveSession]
  )

  const closeSession = useCallback(
    async (sessionId: string) => {
      try {
        await invoke('close_session', { sessionId })
        clearSessionState(sessionId)
        await refreshSessions()
        if (activeSessionId === sessionId) {
          const remaining = sessions.filter((s) => s.id !== sessionId)
          setActiveSession(remaining.length > 0 ? remaining[0].id : null)
        }
      } catch (e) {
        console.error('Failed to close session:', e)
      }
    },
    [refreshSessions, activeSessionId, sessions, setActiveSession, clearSessionState]
  )

  const sendMessage = useCallback(
    async (message: string) => {
      if (!activeSessionId) return
      setBusy(true)
      try {
        await invoke('pty_write', {
          sessionId: activeSessionId,
          data: message + '\n',
        })
      } catch (e) {
        console.error('Failed to send message:', e)
        setBusy(false)
      }
    },
    [activeSessionId, setBusy]
  )

  const interruptSession = useCallback(async () => {
    if (!activeSessionId) return
    try {
      await invoke('interrupt_session', { sessionId: activeSessionId })
      setBusy(false)
    } catch (e) {
      console.error('Failed to interrupt session:', e)
    }
  }, [activeSessionId, setBusy])

  return {
    sessions,
    activeSessionId,
    setupListeners,
    refreshSessions,
    createSession,
    closeSession,
    sendMessage,
    interruptSession,
    setActiveSession,
  }
}
