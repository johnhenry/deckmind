import type { ButtonMapping, SemanticAction, KeyBinding } from '../types'

// Buttons with fixed terminal roles that cannot be reassigned
export const FIXED_GAMEPAD_BUTTONS = new Set([
  'A', 'B', 'X', 'Y', 'Start', 'Select',
  'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight',
  'L3', 'R3', 'R5',
])

// Build combo string for lookup: "ctrl+1", "ctrl+space", "escape"
function formatKeyCombo(kb: KeyBinding): string {
  const parts: string[] = []
  for (const mod of kb.modifiers) {
    parts.push(mod.toLowerCase())
  }
  parts.push(kb.key.toLowerCase())
  return parts.join('+')
}

/** Build a keyboard combo → SemanticAction lookup map from config */
export function buildKeyboardMap(mappings: ButtonMapping[]): Record<string, SemanticAction> {
  const map: Record<string, SemanticAction> = {}
  for (const m of mappings) {
    if (!m.keyboard) continue
    const combo = formatKeyCombo(m.keyboard)
    map[combo] = m.action as SemanticAction
  }
  return map
}

/** Build a gamepad button → SemanticAction lookup map from config, excluding fixed buttons */
export function buildGamepadMap(mappings: ButtonMapping[]): Record<string, SemanticAction> {
  const map: Record<string, SemanticAction> = {}
  for (const m of mappings) {
    if (!m.gamepad) continue
    if (FIXED_GAMEPAD_BUTTONS.has(m.gamepad)) continue
    map[m.gamepad] = m.action as SemanticAction
  }
  return map
}

/** Format a KeyBinding for display: "Ctrl+1", "Escape", "--" */
export function formatKeyBinding(kb: KeyBinding | null): string {
  if (!kb) return '--'
  const parts: string[] = []
  for (const mod of kb.modifiers) {
    parts.push(mod.charAt(0).toUpperCase() + mod.slice(1).toLowerCase())
  }
  // Capitalize key: single chars uppercase, multi-char capitalize first
  const key = kb.key
  if (key.length === 1) {
    parts.push(key.toUpperCase())
  } else {
    parts.push(key.charAt(0).toUpperCase() + key.slice(1))
  }
  return parts.join('+')
}

/** Format a gamepad button for display, showing "--" for fixed buttons */
export function formatGamepadBinding(button: string | null): string {
  if (!button) return '--'
  if (FIXED_GAMEPAD_BUTTONS.has(button)) return '--'
  return button
}

/** Default button mappings for "Reset to Defaults" */
export function getDefaultMappings(): ButtonMapping[] {
  return [
    { action: 'context', keyboard: { key: '1', modifiers: ['Ctrl'] }, gamepad: null },
    { action: 'explain', keyboard: { key: '2', modifiers: ['Ctrl'] }, gamepad: null },
    { action: 'fix', keyboard: { key: '3', modifiers: ['Ctrl'] }, gamepad: null },
    { action: 'continue', keyboard: { key: '4', modifiers: ['Ctrl'] }, gamepad: null },
    { action: 'plan', keyboard: { key: '5', modifiers: ['Ctrl'] }, gamepad: null },
    { action: 'summarize', keyboard: { key: '6', modifiers: ['Ctrl'] }, gamepad: null },
    { action: 'interrupt', keyboard: { key: 'Escape', modifiers: [] }, gamepad: null },
    { action: 'voice', keyboard: { key: 'Space', modifiers: ['Ctrl'] }, gamepad: 'R2' },
  ]
}
