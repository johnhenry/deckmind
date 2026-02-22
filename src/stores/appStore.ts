import { create } from 'zustand'
import type { Terminal } from '@xterm/xterm'
import type { SessionInfo, SafetyMode, AppConfig } from '../types'

interface AppStore {
  // Sessions
  sessions: SessionInfo[]
  activeSessionId: string | null

  // Terminal
  terminalInstance: Terminal | null

  // State
  safetyMode: SafetyMode
  isRecordingVoice: boolean
  isBusy: boolean
  showSettings: boolean
  showActionMenu: boolean

  // Config
  config: AppConfig | null

  // Draft text input
  draftText: string

  // Session lifecycle
  sessionEnded: boolean
  claudeResumeId: string | null

  // Actions
  setSessions: (sessions: SessionInfo[]) => void
  setActiveSession: (id: string | null) => void
  setTerminalInstance: (term: Terminal | null) => void
  focusTerminal: () => void
  setSafetyMode: (mode: SafetyMode) => void
  setRecordingVoice: (recording: boolean) => void
  setBusy: (busy: boolean) => void
  setShowSettings: (show: boolean) => void
  setShowActionMenu: (show: boolean) => void
  setConfig: (config: AppConfig) => void
  setDraftText: (text: string) => void
  setSessionEnded: (ended: boolean) => void
  setClaudeResumeId: (id: string | null) => void
}

export const useAppStore = create<AppStore>((set) => ({
  sessions: [],
  activeSessionId: null,
  terminalInstance: null,
  safetyMode: 'confirm',
  isRecordingVoice: false,
  isBusy: false,
  showSettings: false,
  showActionMenu: false,
  config: null,
  draftText: '',
  sessionEnded: false,
  claudeResumeId: null,

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
  setShowSettings: (show) => set({ showSettings: show }),
  setShowActionMenu: (show) => set({ showActionMenu: show }),
  setConfig: (config) => set({ config, safetyMode: config.safety_mode }),
  setDraftText: (text) => set({ draftText: text }),
  setSessionEnded: (ended) => set({ sessionEnded: ended }),
  setClaudeResumeId: (id) => set({ claudeResumeId: id }),
}))
