import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'
import { executeStartMenuItem, buildStartMenuItemsForTab } from '../components/StartMenu'
import { buildClaudeCommand } from '../utils/buildClaudeCommand'
import type { SessionInfo } from '../types'

// Buttons the hidraw reader emits that we handle.
const KNOWN_BUTTONS = new Set([
  'A', 'B', 'X', 'Y', 'L1', 'L2', 'R1', 'R2',
  'Select', 'Start', 'Steam',
  'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight',
  'L3', 'R3', 'L5', 'R5',
])

// Map button names → ControllerBar button IDs for visual feedback
const CONFIG_TO_BAR: Record<string, string> = {
  A: 'A',
  B: 'B',
  X: 'X',
  Y: 'Y',
  L1: 'L1',
  R1: 'R1',
  R2: 'R2',
  Select: 'Select',
  Start: 'Start',
}

async function ptyWrite(sessionId: string, data: string) {
  await invoke('pty_write', { sessionId, data })
}

async function ptyWriteAndSubmit(sessionId: string, text: string) {
  await ptyWrite(sessionId, text)
  await new Promise((r) => setTimeout(r, 50))
  await ptyWrite(sessionId, '\r')
}

interface GamepadButtonPayload {
  button: string
  pressed: boolean
}

interface GamepadStickPayload {
  stick: string
  y: number
}

export function useGamepad() {
  const voiceActiveRef = useRef(false)

  useEffect(() => {
    // --- Single button event listener for ALL UI modes ---
    const unlistenBtn = listen<GamepadButtonPayload>('gamepad-button', async (event) => {
      const { button: configButton, pressed } = event.payload
      if (!KNOWN_BUTTONS.has(configButton)) return

      const state = useAppStore.getState()

      // Visual feedback: highlight on press, clear on release
      if (pressed) {
        state.setActiveGamepadButton(CONFIG_TO_BAR[configButton] ?? null)
      } else {
        state.setActiveGamepadButton(null)
      }

      // R2 release → stop voice recording (works in all modes)
      if (!pressed && configButton === 'R2' && voiceActiveRef.current) {
        voiceActiveRef.current = false
        state.setRecordingVoice(false)
        if (!state.activeSessionId) return
        try {
          const transcription = await invoke<string>('stop_voice_recording')
          if (transcription && transcription.trim().length > 0) {
            // Route voice transcription based on current mode
            const currentState = useAppStore.getState()
            if (currentState.uiMode === 'newSession' && currentState.newSessionFieldIndex === 0) {
              // In new session dialog with name field focused: populate name
              const currentName = currentState.newSessionName
              const prefix = currentName.trim() ? currentName.trim() + ' ' : ''
              currentState.setNewSessionName(prefix + transcription)
            } else {
              // Default: populate draft text
              const currentDraft = currentState.draftText
              const prefix = currentDraft.trim() ? currentDraft.trim() + ' ' : ''
              currentState.setDraftText(prefix + transcription)
            }
          }
        } catch (e) {
          console.error('Voice transcription failed:', e)
        }
        return
      }

      // Only handle presses from here
      if (!pressed) return

      // R2 press → start voice (works in all modes)
      if (configButton === 'R2') {
        if (!state.activeSessionId) return
        voiceActiveRef.current = true
        state.setRecordingVoice(true)
        try {
          await invoke('start_voice_recording')
        } catch (e) {
          console.error('Gamepad voice start failed:', e)
          voiceActiveRef.current = false
          state.setRecordingVoice(false)
        }
        return
      }

      // Dispatch based on UI mode
      switch (state.uiMode) {
        case 'terminal':
          await handleTerminalButton(configButton, state)
          break
        case 'startMenu':
          await handleStartMenuButton(configButton, state)
          break
        case 'newSession':
          await handleNewSessionButton(configButton, state)
          break
        case 'dirBrowser':
          await handleDirBrowserButton(configButton, state)
          break
        case 'modelManager':
          await handleModelManagerButton(configButton, state)
          break
      }
    })

    // --- Stick event listener (right stick scrolling) ---
    const unlistenStick = listen<GamepadStickPayload>('gamepad-stick', (event) => {
      const { stick, y } = event.payload
      if (stick !== 'right') return
      const term = useAppStore.getState().terminalInstance
      if (!term) return
      // Map stick deflection to scroll amount: larger deflection = more lines
      const lines = Math.round(y / 8000)
      if (lines !== 0) {
        term.scrollLines(lines)
      }
    })

    return () => {
      unlistenBtn.then((fn) => fn())
      unlistenStick.then((fn) => fn())
    }
  }, [])
}

// --- Terminal mode button handler ---
async function handleTerminalButton(button: string, state: ReturnType<typeof useAppStore.getState>) {
  const { activeSessionId, draftText, setDraftText, setUIMode } = state

  // Read per-session state
  const ss = activeSessionId ? state.getSessionState(activeSessionId) : { ended: false, resumeId: null }

  switch (button) {
    case 'A': {
      const text = draftText.trim()
      if (!text || !activeSessionId) return
      try {
        await ptyWriteAndSubmit(activeSessionId, text)
        setDraftText('')
      } catch (e) {
        console.error('Gamepad send failed:', e)
      }
      return
    }

    case 'B': {
      if (!activeSessionId) return
      if (ss.ended) {
        try {
          const claudePath = await invoke<string>('get_claude_path', { sessionId: activeSessionId })
          const flags = await invoke<string>('get_session_flags', { sessionId: activeSessionId })
          const cmd = buildClaudeCommand(claudePath, flags, {
            resumeId: ss.resumeId ?? undefined,
          })
          state.setSessionEnded(activeSessionId, false)
          state.setClaudeResumeId(activeSessionId, null)
          await ptyWrite(activeSessionId, cmd + '\r')
        } catch (e) {
          console.error('Gamepad restart failed:', e)
        }
      } else {
        try {
          await ptyWrite(activeSessionId, '\x03')
        } catch (e) {
          console.error('Gamepad stop failed:', e)
        }
      }
      return
    }

    case 'Y': {
      // Continue: restart Claude with --continue when session ended
      if (!activeSessionId) return
      if (!ss.ended) return
      try {
        const claudePath = await invoke<string>('get_claude_path', { sessionId: activeSessionId })
        const flags = await invoke<string>('get_session_flags', { sessionId: activeSessionId })
        const cmd = buildClaudeCommand(claudePath, flags, { continue: true })
        state.setSessionEnded(activeSessionId, false)
        state.setClaudeResumeId(activeSessionId, null)
        await ptyWrite(activeSessionId, cmd + '\r')
      } catch (e) {
        console.error('Gamepad continue failed:', e)
      }
      return
    }

    case 'R1': {
      // Send Escape to PTY
      if (!activeSessionId) return
      await ptyWrite(activeSessionId, '\x1b').catch(() => {})
      return
    }

    case 'L1': {
      if (!activeSessionId) return
      try {
        await ptyWrite(activeSessionId, '\x1b[Z')
      } catch (e) {
        console.error('Gamepad cycle mode failed:', e)
      }
      return
    }

    case 'Select': {
      const { sessions } = state
      if (sessions.length <= 1) return
      const currentIdx = sessions.findIndex((s) => s.id === activeSessionId)
      const next = sessions[(currentIdx + 1) % sessions.length]
      state.setActiveSession(next.id)
      state.showToast(next.name)
      return
    }

    case 'Start': {
      setUIMode('startMenu')
      return
    }

    case 'X': {
      if (state.keyboardActive) {
        state.setKeyboardActive(false)
        state.focusTerminal()
        state.showToast('Keyboard dismissed')
      } else {
        state.setKeyboardActive(true)
        state.showToast('Keyboard')
      }
      return
    }

    case 'R5': {
      if (!activeSessionId) return
      await ptyWrite(activeSessionId, '\t').catch(() => {})
      return
    }

    case 'L3': {
      if (draftText.trim()) {
        setDraftText('')
        state.showToast('Draft cleared')
      }
      return
    }

    case 'R3': {
      state.terminalInstance?.scrollToBottom()
      return
    }

    case 'DPadUp': {
      if (!activeSessionId) return
      await ptyWrite(activeSessionId, '\x1b[A').catch(() => {})
      return
    }
    case 'DPadDown': {
      if (!activeSessionId) return
      await ptyWrite(activeSessionId, '\x1b[B').catch(() => {})
      return
    }
    case 'DPadLeft': {
      if (!activeSessionId) return
      await ptyWrite(activeSessionId, '\x1b[D').catch(() => {})
      return
    }
    case 'DPadRight': {
      if (!activeSessionId) return
      await ptyWrite(activeSessionId, '\x1b[C').catch(() => {})
      return
    }
  }
}

// --- Start menu button handler ---
async function handleStartMenuButton(button: string, state: ReturnType<typeof useAppStore.getState>) {
  const { startMenuFocusIndex, setStartMenuFocusIndex, startMenuTab, setStartMenuTab, setUIMode } = state
  const items = buildStartMenuItemsForTab(startMenuTab)
  const maxIndex = items.length - 1

  switch (button) {
    case 'DPadLeft': {
      // Previous tab (same as L1)
      setStartMenuTab(startMenuTab <= 0 ? 2 : startMenuTab - 1)
      return
    }
    case 'DPadRight': {
      // Next tab (same as R1)
      setStartMenuTab(startMenuTab >= 2 ? 0 : startMenuTab + 1)
      return
    }

    case 'DPadUp': {
      setStartMenuFocusIndex(Math.max(0, startMenuFocusIndex - 1))
      return
    }
    case 'DPadDown': {
      setStartMenuFocusIndex(Math.min(maxIndex, startMenuFocusIndex + 1))
      return
    }

    case 'A': {
      const item = items[startMenuFocusIndex]
      if (!item) return
      // Skip disabled actions (no active session)
      if (item.type === 'action' && !state.activeSessionId) return
      await executeStartMenuItem(item)
      return
    }

    case 'B':
    case 'Start': {
      setUIMode('terminal')
      return
    }

    case 'X': {
      // Close focused session (only in Sessions tab)
      if (startMenuTab !== 0) return
      const item = items[startMenuFocusIndex]
      if (item?.type === 'session' && item.sessionId) {
        try {
          await invoke('close_session', { sessionId: item.sessionId })
          state.clearSessionState(item.sessionId)
          const result = await invoke<SessionInfo[]>('list_sessions')
          state.setSessions(result)
          if (state.activeSessionId === item.sessionId) {
            state.setActiveSession(result.length > 0 ? result[0].id : null)
          }
          // Adjust focus if we deleted the last item
          const newItems = buildStartMenuItemsForTab(0)
          if (startMenuFocusIndex >= newItems.length) {
            setStartMenuFocusIndex(Math.max(0, newItems.length - 1))
          }
        } catch (e) {
          console.error('Failed to close session:', e)
        }
      }
      return
    }
  }
}

// --- New session dialog button handler (single source of truth) ---
async function handleNewSessionButton(button: string, state: ReturnType<typeof useAppStore.getState>) {
  const {
    setUIMode,
    newSessionFieldIndex,
    setNewSessionFieldIndex,
    newSessionDirIndex,
    setNewSessionDirIndex,
    recentDirs,
    triggerNewSessionCreate,
    newSessionWorktree,
    setNewSessionWorktree,
  } = state

  const FIELD_COUNT = 4 // name, directory, worktree, create

  switch (button) {
    case 'B': {
      setUIMode('startMenu')
      return
    }
    case 'Start': {
      setUIMode('terminal')
      return
    }
    case 'DPadUp': {
      setNewSessionFieldIndex(Math.max(0, newSessionFieldIndex - 1))
      return
    }
    case 'DPadDown': {
      setNewSessionFieldIndex(Math.min(FIELD_COUNT - 1, newSessionFieldIndex + 1))
      return
    }
    case 'DPadLeft': {
      if (newSessionFieldIndex === 1) { // directory field
        setNewSessionDirIndex(Math.max(-1, newSessionDirIndex - 1))
      } else if (newSessionFieldIndex === 2) { // worktree toggle
        setNewSessionWorktree(!newSessionWorktree)
      }
      return
    }
    case 'DPadRight': {
      if (newSessionFieldIndex === 1 && recentDirs.length > 0) {
        setNewSessionDirIndex(Math.min(recentDirs.length - 1, newSessionDirIndex + 1))
      } else if (newSessionFieldIndex === 2) { // worktree toggle
        setNewSessionWorktree(!newSessionWorktree)
      }
      return
    }
    case 'Y': {
      if (newSessionFieldIndex === 1) {
        // Open directory browser starting from current dir or home
        const currentDir = newSessionDirIndex === -1 ? '' : (recentDirs[newSessionDirIndex] || '')
        if (currentDir) {
          state.setDirBrowserPath(currentDir)
        } else {
          try {
            const homeDir = await invoke<string>('get_home_dir')
            state.setDirBrowserPath(homeDir)
          } catch {
            state.setDirBrowserPath('/')
          }
        }
        setUIMode('dirBrowser')
      } else if (newSessionFieldIndex === 3) {
        // Create session with --continue
        state.setNewSessionContinue(true)
        triggerNewSessionCreate()
      }
      return
    }
    case 'A': {
      if (newSessionFieldIndex === 3) { // create button (fresh start)
        state.setNewSessionContinue(false)
        triggerNewSessionCreate()
      }
      return
    }
  }
}

// --- Model manager button handler ---
async function handleModelManagerButton(button: string, state: ReturnType<typeof useAppStore.getState>) {
  const {
    modelManagerFocusIndex,
    setModelManagerFocusIndex,
    modelList,
    modelDownloading,
    setModelDownloading,
    setModelDownloadPercent,
    setModelDownloadError,
    setUIMode,
    config,
    showToast,
  } = state

  const maxIndex = modelList.length - 1
  const activeModel = config?.whisper_model || 'base.en'

  switch (button) {
    case 'DPadUp': {
      setModelManagerFocusIndex(Math.max(0, modelManagerFocusIndex - 1))
      return
    }
    case 'DPadDown': {
      setModelManagerFocusIndex(Math.min(maxIndex, modelManagerFocusIndex + 1))
      return
    }
    case 'A': {
      const model = modelList[modelManagerFocusIndex]
      if (!model) return
      if (model.downloaded) {
        // Select as active model
        try {
          await invoke('set_whisper_model', { modelName: model.name })
          if (config) {
            state.setConfig({ ...config, whisper_model: model.name })
          }
          showToast(`Model: ${model.name}`)
        } catch (e) {
          console.error('Failed to set model:', e)
        }
      } else if (!modelDownloading) {
        // Start download
        setModelDownloading(model.name)
        setModelDownloadPercent(0)
        setModelDownloadError(null)
        try {
          await invoke('download_whisper_model', { modelName: model.name })
        } catch (e) {
          console.error('Failed to start download:', e)
          setModelDownloading(null)
        }
      }
      return
    }
    case 'X': {
      // Cancel active download
      if (modelDownloading) {
        try {
          await invoke('cancel_model_download')
        } catch (e) {
          console.error('Failed to cancel download:', e)
        }
      }
      return
    }
    case 'Y': {
      // Delete model (if downloaded and not active)
      const model = modelList[modelManagerFocusIndex]
      if (!model || !model.downloaded || model.name === activeModel) return
      try {
        await invoke('delete_whisper_model', { modelName: model.name })
        // Refresh list
        const models = await invoke<import('../types').WhisperModelInfo[]>('list_whisper_models')
        state.setModelList(models)
        showToast(`Deleted ${model.name}`)
      } catch (e) {
        console.error('Failed to delete model:', e)
      }
      return
    }
    case 'B':
    case 'Start': {
      setUIMode('startMenu')
      return
    }
  }
}

// --- Directory browser button handler ---
async function handleDirBrowserButton(button: string, state: ReturnType<typeof useAppStore.getState>) {
  const {
    dirBrowserEntries,
    dirBrowserFocusIndex,
    setDirBrowserFocusIndex,
    setDirBrowserPath,
    setUIMode,
    addRecentDir,
    setNewSessionDirIndex,
  } = state

  const maxIndex = dirBrowserEntries.length - 1

  switch (button) {
    case 'DPadUp': {
      setDirBrowserFocusIndex(Math.max(0, dirBrowserFocusIndex - 1))
      return
    }
    case 'DPadDown': {
      setDirBrowserFocusIndex(Math.min(maxIndex, dirBrowserFocusIndex + 1))
      return
    }
    case 'A': {
      // Enter directory
      const entry = dirBrowserEntries[dirBrowserFocusIndex]
      if (entry?.is_dir) {
        setDirBrowserPath(entry.path)
      }
      return
    }
    case 'B': {
      // Go up one level (parent)
      const currentPath = state.dirBrowserPath
      const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/'
      if (parent !== currentPath) {
        setDirBrowserPath(parent)
      }
      return
    }
    case 'X': {
      // Select current directory — use the browser's current path
      const selectedDir = state.dirBrowserPath
      if (selectedDir) {
        addRecentDir(selectedDir)
        // Find the new index in recentDirs after adding
        const updatedDirs = useAppStore.getState().recentDirs
        const idx = updatedDirs.indexOf(selectedDir)
        setNewSessionDirIndex(idx >= 0 ? idx : 0)
      }
      setUIMode('newSession')
      return
    }
    case 'Start': {
      // Cancel — go back to new session without selecting
      setUIMode('newSession')
      return
    }
  }
}
