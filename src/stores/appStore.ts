import { create } from 'zustand'
import type { Terminal } from '@xterm/xterm'
import type { SessionInfo, SafetyMode, AppConfig, UIMode, DirEntry } from '../types'

interface SessionState {
  ended: boolean
  resumeId: string | null
}

function loadRecentDirs(): string[] {
  try {
    const stored = localStorage.getItem('deckmind-recent-dirs')
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveRecentDirs(dirs: string[]) {
  try {
    localStorage.setItem('deckmind-recent-dirs', JSON.stringify(dirs))
  } catch { /* ignore */ }
}

interface AppStore {
  // Sessions
  sessions: SessionInfo[]
  activeSessionId: string | null
  sessionStates: Record<string, SessionState>

  // Terminal
  terminalInstance: Terminal | null

  // State
  safetyMode: SafetyMode
  isRecordingVoice: boolean
  isBusy: boolean

  // UI Mode
  uiMode: UIMode
  startMenuFocusIndex: number
  textInputFocused: boolean
  keyboardActive: boolean

  // New session dialog state (owned by store so useGamepad is sole gamepad listener)
  newSessionFieldIndex: number
  newSessionDirIndex: number
  newSessionName: string
  newSessionCreateTrigger: number

  // Recent directories (persisted to localStorage)
  recentDirs: string[]

  // Directory browser state
  dirBrowserPath: string
  dirBrowserEntries: DirEntry[]
  dirBrowserFocusIndex: number
  dirBrowserLoading: boolean

  // New session options
  newSessionWorktree: boolean
  newSessionContinue: boolean

  // Config
  config: AppConfig | null

  // Toast
  toastMessage: string | null
  toastTimerId: ReturnType<typeof setTimeout> | null

  // Draft text input
  draftText: string

  // Gamepad
  activeGamepadButton: string | null

  // Actions
  setSessions: (sessions: SessionInfo[]) => void
  setActiveSession: (id: string | null) => void
  setTerminalInstance: (term: Terminal | null) => void
  focusTerminal: () => void
  setSafetyMode: (mode: SafetyMode) => void
  setRecordingVoice: (recording: boolean) => void
  setBusy: (busy: boolean) => void
  setUIMode: (mode: UIMode) => void
  setStartMenuFocusIndex: (index: number) => void
  setTextInputFocused: (focused: boolean) => void
  setKeyboardActive: (on: boolean) => void
  setNewSessionFieldIndex: (index: number) => void
  setNewSessionDirIndex: (index: number) => void
  setNewSessionName: (name: string) => void
  triggerNewSessionCreate: () => void
  setRecentDirs: (dirs: string[]) => void
  addRecentDir: (dir: string) => void
  setDirBrowserPath: (path: string) => void
  setDirBrowserEntries: (entries: DirEntry[]) => void
  setDirBrowserFocusIndex: (index: number) => void
  setDirBrowserLoading: (loading: boolean) => void
  setNewSessionWorktree: (on: boolean) => void
  setNewSessionContinue: (on: boolean) => void
  setConfig: (config: AppConfig) => void
  showToast: (message: string) => void
  clearToast: () => void
  setDraftText: (text: string) => void
  getSessionState: (sessionId: string) => SessionState
  setSessionEnded: (sessionId: string, ended: boolean) => void
  setClaudeResumeId: (sessionId: string, resumeId: string | null) => void
  clearSessionState: (sessionId: string) => void
  setActiveGamepadButton: (button: string | null) => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  sessionStates: {},
  terminalInstance: null,
  safetyMode: 'confirm',
  isRecordingVoice: false,
  isBusy: false,
  uiMode: 'terminal',
  startMenuFocusIndex: 0,
  textInputFocused: false,
  keyboardActive: false,
  newSessionFieldIndex: 0,
  newSessionDirIndex: -1,
  newSessionName: '',
  newSessionCreateTrigger: 0,
  recentDirs: loadRecentDirs(),
  dirBrowserPath: '',
  dirBrowserEntries: [],
  dirBrowserFocusIndex: 0,
  dirBrowserLoading: false,
  newSessionWorktree: false,
  newSessionContinue: false,
  config: null,
  toastMessage: null,
  toastTimerId: null,
  draftText: '',
  activeGamepadButton: null,

  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setTerminalInstance: (term) => set({ terminalInstance: term }),
  focusTerminal: () => {
    const { terminalInstance } = useAppStore.getState()
    terminalInstance?.focus()
  },
  setSafetyMode: (mode) => set({ safetyMode: mode }),
  setRecordingVoice: (recording) => set({ isRecordingVoice: recording }),
  setBusy: (busy) => set({ isBusy: busy }),
  setUIMode: (mode) => {
    if (mode === 'newSession') {
      const current = get().uiMode
      if (current === 'dirBrowser') {
        // Returning from directory browser — preserve newSession state
        set({ uiMode: mode, keyboardActive: false })
      } else {
        // Fresh dialog — reset everything
        set({
          uiMode: mode,
          startMenuFocusIndex: 0,
          keyboardActive: false,
          newSessionFieldIndex: 0,
          newSessionDirIndex: -1,
          newSessionName: '',
          newSessionCreateTrigger: 0,
          newSessionWorktree: false,
          newSessionContinue: false,
        })
      }
    } else if (mode === 'dirBrowser') {
      set({ uiMode: mode, dirBrowserFocusIndex: 0, keyboardActive: false })
    } else {
      set({ uiMode: mode, startMenuFocusIndex: 0, keyboardActive: false })
    }
  },
  setStartMenuFocusIndex: (index) => set({ startMenuFocusIndex: index }),
  setTextInputFocused: (focused) => set({ textInputFocused: focused }),
  setKeyboardActive: (on) => set({ keyboardActive: on }),
  setNewSessionFieldIndex: (index) => set({ newSessionFieldIndex: index }),
  setNewSessionDirIndex: (index) => set({ newSessionDirIndex: index }),
  setNewSessionName: (name) => set({ newSessionName: name }),
  triggerNewSessionCreate: () => set((s) => ({ newSessionCreateTrigger: s.newSessionCreateTrigger + 1 })),
  setRecentDirs: (dirs) => { saveRecentDirs(dirs); set({ recentDirs: dirs }) },
  addRecentDir: (dir: string) => {
    const current = get().recentDirs.filter((d) => d !== dir)
    const updated = [dir, ...current].slice(0, 10)
    saveRecentDirs(updated)
    set({ recentDirs: updated })
  },
  setDirBrowserPath: (path) => set({ dirBrowserPath: path }),
  setDirBrowserEntries: (entries) => set({ dirBrowserEntries: entries }),
  setDirBrowserFocusIndex: (index) => set({ dirBrowserFocusIndex: index }),
  setDirBrowserLoading: (loading) => set({ dirBrowserLoading: loading }),
  setNewSessionWorktree: (on) => set({ newSessionWorktree: on }),
  setNewSessionContinue: (on) => set({ newSessionContinue: on }),
  setConfig: (config) => set({ config, safetyMode: config.safety_mode }),
  showToast: (message: string) => {
    const prev = get().toastTimerId
    if (prev) clearTimeout(prev)
    const timerId = setTimeout(() => {
      set({ toastMessage: null, toastTimerId: null })
    }, 1500)
    set({ toastMessage: message, toastTimerId: timerId })
  },
  clearToast: () => {
    const prev = get().toastTimerId
    if (prev) clearTimeout(prev)
    set({ toastMessage: null, toastTimerId: null })
  },
  setDraftText: (text) => set({ draftText: text }),
  getSessionState: (sessionId: string) => {
    return get().sessionStates[sessionId] || { ended: false, resumeId: null }
  },
  setSessionEnded: (sessionId: string, ended: boolean) => {
    const states = { ...get().sessionStates }
    states[sessionId] = { ...(states[sessionId] || { ended: false, resumeId: null }), ended }
    set({ sessionStates: states })
  },
  setClaudeResumeId: (sessionId: string, resumeId: string | null) => {
    const states = { ...get().sessionStates }
    states[sessionId] = { ...(states[sessionId] || { ended: false, resumeId: null }), resumeId }
    set({ sessionStates: states })
  },
  clearSessionState: (sessionId: string) => {
    const states = { ...get().sessionStates }
    delete states[sessionId]
    set({ sessionStates: states })
  },
  setActiveGamepadButton: (button) => set({ activeGamepadButton: button }),
}))
