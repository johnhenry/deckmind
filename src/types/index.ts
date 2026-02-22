export type SemanticAction =
  | 'explain'
  | 'fix'
  | 'continue'
  | 'plan'
  | 'summarize'
  | 'context'
  | 'interrupt'
  | 'voice'

export type SafetyMode = 'observe' | 'suggest' | 'confirm' | 'auto'

export interface SessionInfo {
  id: string
  name: string
  working_dir: string | null
  created_at: string
  is_active: boolean
  is_busy: boolean
}

export interface KeyBinding {
  key: string
  modifiers: string[]
}

export interface ButtonMapping {
  action: string
  keyboard: KeyBinding | null
  gamepad: string | null
}

export interface AppConfig {
  claude_path: string
  safety_mode: SafetyMode
  button_mappings: ButtonMapping[]
  whisper_model: string
  default_working_dir: string | null
  voice_enabled: boolean
  theme: string
}

export interface ActionDef {
  id: SemanticAction
  label: string
  description: string
  icon: string
  shortcutLabel: string
}

export const ACTIONS: ActionDef[] = [
  { id: 'context', label: 'Context', description: 'What am I doing', icon: '?', shortcutLabel: 'Ctrl+1' },
  { id: 'explain', label: 'Explain', description: 'Understand current state', icon: 'i', shortcutLabel: 'Ctrl+2' },
  { id: 'fix', label: 'Fix', description: 'Diagnose & repair', icon: '!', shortcutLabel: 'Ctrl+3' },
  { id: 'continue', label: 'Continue', description: 'Resume last task', icon: '>', shortcutLabel: 'Ctrl+4' },
  { id: 'plan', label: 'Plan', description: 'Decide next steps', icon: '#', shortcutLabel: 'Ctrl+5' },
  { id: 'summarize', label: 'Summarize', description: 'Recent activity', icon: '=', shortcutLabel: 'Ctrl+6' },
  { id: 'interrupt', label: 'Stop', description: 'Interrupt agent', icon: 'x', shortcutLabel: 'Esc' },
  { id: 'voice', label: 'Voice', description: 'Speak command', icon: '~', shortcutLabel: 'Ctrl+Space' },
]

// Actions available in the R1 action menu
export const MENU_ACTIONS: ActionDef[] = [
  { id: 'context', label: 'Context', description: 'What am I doing', icon: '?', shortcutLabel: 'Ctrl+1' },
  { id: 'explain', label: 'Explain', description: 'Understand current state', icon: 'i', shortcutLabel: 'Ctrl+2' },
  { id: 'fix', label: 'Fix', description: 'Diagnose & repair', icon: '!', shortcutLabel: 'Ctrl+3' },
  { id: 'continue', label: 'Continue', description: 'Resume last task', icon: '>', shortcutLabel: 'Ctrl+4' },
  { id: 'plan', label: 'Plan', description: 'Decide next steps', icon: '#', shortcutLabel: 'Ctrl+5' },
  { id: 'summarize', label: 'Summarize', description: 'Recent activity', icon: '=', shortcutLabel: 'Ctrl+6' },
]
