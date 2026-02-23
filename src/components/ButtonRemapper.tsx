import { useEffect, useRef, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useAppStore } from '../stores/appStore'
import { ACTIONS } from '../types'
import type { KeyBinding } from '../types'
import { formatKeyBinding, formatGamepadBinding, FIXED_GAMEPAD_BUTTONS } from '../utils/buttonMappings'

export function ButtonRemapper() {
  const {
    uiMode,
    config,
    remapperFocusIndex,
    remapperCaptureState,
    setRemapperCaptureState,
    showToast,
  } = useAppStore()

  const listRef = useRef<HTMLDivElement>(null)
  const mappings = config?.button_mappings ?? []

  // Find the mapping for a given action
  const getMappingForAction = (actionId: string) => {
    return mappings.find((m) => m.action === actionId)
  }

  // Scroll focused item into view
  useEffect(() => {
    if (uiMode !== 'remapper') return
    const container = listRef.current
    if (!container) return
    const focused = container.querySelector('.remapper-entry.focused')
    if (focused) {
      focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [remapperFocusIndex, uiMode])

  // Keyboard capture: intercept all keydown events when in keyboard capture mode
  useEffect(() => {
    if (uiMode !== 'remapper') return
    if (!remapperCaptureState || remapperCaptureState.bindingType !== 'keyboard') return

    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const key = e.key
      // Ignore modifier-only presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return

      // Escape cancels
      if (key === 'Escape') {
        setRemapperCaptureState(null)
        return
      }

      // Build the key binding
      const modifiers: string[] = []
      if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl')
      if (e.shiftKey) modifiers.push('Shift')
      if (e.altKey) modifiers.push('Alt')

      const kb: KeyBinding = { key, modifiers }
      applyKeyboardBinding(remapperCaptureState.actionIndex, kb)
      setRemapperCaptureState(null)
    }

    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [uiMode, remapperCaptureState])

  // Gamepad capture: listen for gamepad-button events when in gamepad capture mode
  useEffect(() => {
    if (uiMode !== 'remapper') return
    if (!remapperCaptureState || remapperCaptureState.bindingType !== 'gamepad') return

    const unlisten = listen<{ button: string; pressed: boolean }>('gamepad-button', (event) => {
      if (!event.payload.pressed) return
      const button = event.payload.button

      // B cancels
      if (button === 'B') {
        setRemapperCaptureState(null)
        return
      }

      // Reject fixed buttons
      if (FIXED_GAMEPAD_BUTTONS.has(button)) {
        showToast(`${button} is reserved`)
        return
      }

      // Apply binding
      applyGamepadBinding(remapperCaptureState.actionIndex, button)
      setRemapperCaptureState(null)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [uiMode, remapperCaptureState])

  // Apply a keyboard binding to an action
  const applyKeyboardBinding = async (actionIndex: number, kb: KeyBinding) => {
    const currentConfig = useAppStore.getState().config
    if (!currentConfig) return
    const action = ACTIONS[actionIndex]
    const newMappings = currentConfig.button_mappings.map((m) => ({ ...m }))

    // Check for conflicts: clear other action's keyboard binding if same combo
    const combo = [...kb.modifiers, kb.key].join('+').toLowerCase()
    for (const m of newMappings) {
      if (m.action === action.id) continue
      if (m.keyboard) {
        const otherCombo = [...m.keyboard.modifiers, m.keyboard.key].join('+').toLowerCase()
        if (otherCombo === combo) {
          m.keyboard = null
          showToast(`Cleared ${m.action} keyboard shortcut`)
        }
      }
    }

    // Set the new binding
    const existing = newMappings.find((m) => m.action === action.id)
    if (existing) {
      existing.keyboard = kb
    } else {
      newMappings.push({ action: action.id, keyboard: kb, gamepad: null })
    }

    const newConfig = { ...currentConfig, button_mappings: newMappings }
    useAppStore.getState().setConfig(newConfig)
    try {
      await invoke('update_config', { newConfig })
    } catch (e) {
      console.error('Failed to save config:', e)
    }
  }

  // Apply a gamepad binding to an action
  const applyGamepadBinding = async (actionIndex: number, button: string) => {
    const currentConfig = useAppStore.getState().config
    if (!currentConfig) return
    const action = ACTIONS[actionIndex]
    const newMappings = currentConfig.button_mappings.map((m) => ({ ...m }))

    // Check for conflicts: clear other action's gamepad binding if same button
    for (const m of newMappings) {
      if (m.action === action.id) continue
      if (m.gamepad === button) {
        m.gamepad = null
        showToast(`Cleared ${m.action} gamepad binding`)
      }
    }

    // Set the new binding
    const existing = newMappings.find((m) => m.action === action.id)
    if (existing) {
      existing.gamepad = button
    } else {
      newMappings.push({ action: action.id, keyboard: null, gamepad: button })
    }

    const newConfig = { ...currentConfig, button_mappings: newMappings }
    useAppStore.getState().setConfig(newConfig)
    try {
      await invoke('update_config', { newConfig })
    } catch (e) {
      console.error('Failed to save config:', e)
    }
  }

  if (uiMode !== 'remapper') return null

  // Determine footer content based on capture state
  let footer: ReactNode
  if (remapperCaptureState?.bindingType === 'keyboard') {
    footer = (
      <span className="remapper-capture-text">Press a key combo... | Esc Cancel</span>
    )
  } else if (remapperCaptureState?.bindingType === 'gamepad') {
    footer = (
      <span className="remapper-capture-text">Press a button... | B Cancel</span>
    )
  } else if (remapperCaptureState && remapperCaptureState.bindingType === null) {
    footer = (
      <>
        <span>{'\u25C0'} Keyboard</span>
        <span>Gamepad {'\u25B6'}</span>
        <span>B Cancel</span>
      </>
    )
  } else {
    footer = (
      <>
        <span>A Edit</span>
        <span>X Clear</span>
        <span>Y Defaults</span>
        <span>B Back</span>
      </>
    )
  }

  return (
    <div className="remapper-overlay">
      <div className="remapper">
        <div className="remapper-title">BUTTON MAPPINGS</div>
        <div className="remapper-subtitle">
          Configure keyboard and gamepad shortcuts
        </div>
        <div className="remapper-list" ref={listRef}>
          <div className="remapper-header-row">
            <span className="remapper-col-action">Action</span>
            <span className="remapper-col-keyboard">Keyboard</span>
            <span className="remapper-col-gamepad">Gamepad</span>
          </div>
          {ACTIONS.map((action, index) => {
            const isFocused = index === remapperFocusIndex
            const mapping = getMappingForAction(action.id)
            const isCapturing = remapperCaptureState?.actionIndex === index

            return (
              <div
                key={action.id}
                className={`remapper-entry${isFocused ? ' focused' : ''}${isCapturing ? ' capturing' : ''}`}
              >
                <span className="remapper-col-action">{action.label}</span>
                <span className="remapper-col-keyboard">
                  {formatKeyBinding(mapping?.keyboard ?? null)}
                </span>
                <span className="remapper-col-gamepad">
                  {formatGamepadBinding(mapping?.gamepad ?? null)}
                </span>
              </div>
            )
          })}
        </div>
        <div className="remapper-footer">
          {footer}
        </div>
      </div>
    </div>
  )
}
