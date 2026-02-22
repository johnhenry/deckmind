import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'
import type { SemanticAction } from '../types'

// Buttons the hidraw reader emits that we handle.
// Also used to filter out trackpad touch/click events we don't need.
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
  Select: 'Menu',
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

export function useGamepad() {
  const voiceActiveRef = useRef(false)

  useEffect(() => {
    const unlisten = listen<GamepadButtonPayload>('gamepad-button', async (event) => {
      const { button: configButton, pressed } = event.payload
      if (!KNOWN_BUTTONS.has(configButton)) return

      // Read fresh state snapshot on every event to avoid stale closures
      const state = useAppStore.getState()
      const {
        activeSessionId,
        showActionMenu,
        setShowActionMenu,
        draftText,
        setDraftText,
        sessionEnded,
        claudeResumeId,
        setSessionEnded,
        setClaudeResumeId,
        setRecordingVoice,
        setShowSettings,
        showSettings,
        setActiveGamepadButton,
      } = state

      // Visual feedback: highlight on press, clear on release
      if (pressed) {
        setActiveGamepadButton(CONFIG_TO_BAR[configButton] ?? null)
      } else {
        setActiveGamepadButton(null)
      }

      // Only handle presses for most buttons (except R2 voice which needs release)
      if (!pressed) {
        // R2 release → stop voice recording
        if (configButton === 'R2' && voiceActiveRef.current) {
          voiceActiveRef.current = false
          setRecordingVoice(false)
          if (!activeSessionId) return
          try {
            const transcription = await invoke<string>('stop_voice_recording')
            if (transcription && transcription.trim().length > 0) {
              const currentDraft = useAppStore.getState().draftText
              const prefix = currentDraft.trim() ? currentDraft.trim() + ' ' : ''
              useAppStore.getState().setDraftText(prefix + transcription)
            }
          } catch (e) {
            console.error('Voice transcription failed:', e)
          }
        }
        return
      }

      // --- PRESS handlers below ---

      // Menu mode: action menu is open
      if (showActionMenu) {
        const menuAction = getMenuModeAction(configButton)
        if (menuAction) {
          setShowActionMenu(false)
          await dispatchSemanticAction(menuAction, activeSessionId)
          return
        }
        // B or R1 closes the menu
        if (configButton === 'B' || configButton === 'R1') {
          setShowActionMenu(false)
          return
        }
        // DPad in menu mode
        if (configButton === 'DPadUp') {
          setShowActionMenu(false)
          await dispatchSemanticAction('plan', activeSessionId)
          return
        }
        if (configButton === 'DPadDown') {
          setShowActionMenu(false)
          await dispatchSemanticAction('summarize', activeSessionId)
          return
        }
        return
      }

      // Normal mode
      switch (configButton) {
        case 'A': {
          // Send draft text
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
          if (sessionEnded) {
            // Start/Resume Claude
            try {
              const claudePath = await invoke<string>('get_claude_path', {
                sessionId: activeSessionId,
              })
              let cmd = `${claudePath} --dangerously-skip-permissions`
              if (claudeResumeId) {
                cmd += ` --resume ${claudeResumeId}`
              }
              cmd += `; printf '\\033]666;\\007'`
              setSessionEnded(false)
              setClaudeResumeId(null)
              await ptyWrite(activeSessionId, cmd + '\r')
            } catch (e) {
              console.error('Gamepad restart failed:', e)
            }
          } else {
            // Stop (Ctrl+C)
            try {
              await ptyWrite(activeSessionId, '\x03')
            } catch (e) {
              console.error('Gamepad stop failed:', e)
            }
          }
          return
        }

        case 'L1': {
          // Cycle safety mode (Shift+Tab)
          if (!activeSessionId) return
          try {
            await ptyWrite(activeSessionId, '\x1b[Z')
          } catch (e) {
            console.error('Gamepad cycle mode failed:', e)
          }
          return
        }

        case 'R1': {
          // Toggle action menu
          setShowActionMenu(!showActionMenu)
          return
        }

        case 'R2': {
          // Voice push-to-talk (hold)
          if (!activeSessionId) return
          voiceActiveRef.current = true
          setRecordingVoice(true)
          try {
            await invoke('start_voice_recording')
          } catch (e) {
            console.error('Gamepad voice start failed:', e)
            voiceActiveRef.current = false
            setRecordingVoice(false)
          }
          return
        }

        case 'Select': {
          // Send Escape
          if (!activeSessionId) return
          try {
            await ptyWrite(activeSessionId, '\x1b')
          } catch (e) {
            console.error('Gamepad escape failed:', e)
          }
          return
        }

        case 'Start': {
          // Toggle settings panel
          setShowSettings(!showSettings)
          return
        }

        // DPad → arrow keys to PTY
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

        // X and Y in normal mode: fall through to config button_mappings
        case 'X':
        case 'Y': {
          const action = getConfigAction(configButton, state.config?.button_mappings)
          if (action) {
            await dispatchSemanticAction(action, activeSessionId)
          }
          return
        }
      }
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])
}

// Menu mode button → semantic action mapping
function getMenuModeAction(button: string): SemanticAction | null {
  switch (button) {
    case 'X': return 'context'
    case 'Y': return 'explain'
    case 'A': return 'fix'
    default: return null
  }
}

// Look up action from config button_mappings by gamepad button name
function getConfigAction(
  button: string,
  mappings?: Array<{ action: string; gamepad: string | null }>
): SemanticAction | null {
  if (!mappings) return null
  const mapping = mappings.find((m) => m.gamepad === button)
  if (!mapping) return null
  const valid: SemanticAction[] = ['context', 'explain', 'fix', 'continue', 'plan', 'summarize']
  return valid.includes(mapping.action as SemanticAction)
    ? (mapping.action as SemanticAction)
    : null
}

// Dispatch a semantic action by building its prompt and placing it in draft text
async function dispatchSemanticAction(action: SemanticAction, sessionId: string | null) {
  if (!sessionId) return
  if (action === 'interrupt') {
    try {
      await invoke('pty_write', { sessionId, data: '\x03' })
    } catch (e) {
      console.error('Failed to interrupt:', e)
    }
    return
  }
  try {
    const prompt = await invoke<string>('build_action_prompt', { action })
    useAppStore.getState().setDraftText(prompt)
  } catch (e) {
    console.error('Failed to build action prompt:', e)
  }
}
