import { useMemo, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'
import { buildClaudeCommand } from '../utils/buildClaudeCommand'
import { MENU_ACTIONS } from '../types'
import type { StartMenuItem, SafetyMode, SessionInfo } from '../types'

const SAFETY_MODES: SafetyMode[] = ['observe', 'suggest', 'confirm', 'auto']

/** Build the flat focusable item list from current state.
 *  Shared by the component (via useMemo) and useGamepad (via direct call). */
export function buildStartMenuItems(): StartMenuItem[] {
  const { sessions, activeSessionId, sessionStates, safetyMode, config } = useAppStore.getState()
  const activeState = activeSessionId ? sessionStates[activeSessionId] : undefined
  return buildItemList(sessions, activeState?.ended ?? false, activeState?.resumeId ?? null, safetyMode, config)
}

const MODEL_CYCLE: (string | null)[] = [null, 'sonnet', 'opus', 'haiku']
const EFFORT_CYCLE: (string | null)[] = [null, 'low', 'medium', 'high']

function buildItemList(
  sessions: SessionInfo[],
  sessionEnded: boolean,
  claudeResumeId: string | null,
  safetyMode: SafetyMode,
  config: { voice_enabled: boolean; theme: string; default_model?: string | null; default_effort?: string | null } | null,
): StartMenuItem[] {
  const list: StartMenuItem[] = []

  list.push({ id: 'new-session', type: 'newSession', label: 'New Session' })

  if (sessionEnded && claudeResumeId) {
    list.push({
      id: 'resume-session',
      type: 'resumeSession',
      label: 'Resume Session',
      sublabel: claudeResumeId.slice(0, 8) + '...',
    })
  }

  for (const session of sessions) {
    list.push({
      id: `session-${session.id}`,
      type: 'session',
      label: session.name,
      sublabel: session.working_dir || undefined,
      sessionId: session.id,
    })
  }

  for (const action of MENU_ACTIONS) {
    list.push({
      id: `action-${action.id}`,
      type: 'action',
      label: action.label,
      sublabel: action.description,
      actionId: action.id,
    })
  }

  list.push({
    id: 'setting-safety',
    type: 'setting',
    label: 'Safety Mode',
    settingKey: 'safety_mode',
    value: safetyMode,
  })
  list.push({
    id: 'setting-voice',
    type: 'setting',
    label: 'Voice',
    settingKey: 'voice_enabled',
    value: config?.voice_enabled ? 'enabled' : 'disabled',
  })
  list.push({
    id: 'setting-theme',
    type: 'setting',
    label: 'Theme',
    settingKey: 'theme',
    value: config?.theme || 'cyber',
  })
  list.push({
    id: 'setting-model',
    type: 'setting',
    label: 'Model',
    settingKey: 'default_model',
    value: config?.default_model || 'default',
  })
  list.push({
    id: 'setting-effort',
    type: 'setting',
    label: 'Effort',
    settingKey: 'default_effort',
    value: config?.default_effort || 'default',
  })

  return list
}

function getSection(item: StartMenuItem): string {
  if (item.type === 'newSession' || item.type === 'resumeSession') return 'main'
  if (item.type === 'session') return 'sessions'
  if (item.type === 'action') return 'actions'
  if (item.type === 'setting') return 'settings'
  return ''
}

const SECTION_LABELS: Record<string, string> = {
  sessions: 'SESSIONS',
  actions: 'ACTIONS',
  settings: 'SETTINGS',
}

/** Pre-compute which item indices have a section header above them. */
function computeSectionHeaders(items: StartMenuItem[]): Record<number, string> {
  const headers: Record<number, string> = {}
  let prevSection = ''
  for (let i = 0; i < items.length; i++) {
    const section = getSection(items[i])
    if (section !== prevSection && SECTION_LABELS[section]) {
      headers[i] = SECTION_LABELS[section]
    }
    prevSection = section
  }
  return headers
}

export function StartMenu() {
  const {
    uiMode,
    sessions,
    activeSessionId,
    sessionStates,
    safetyMode,
    config,
    startMenuFocusIndex,
  } = useAppStore()

  const listRef = useRef<HTMLDivElement>(null)

  const activeState = activeSessionId ? sessionStates[activeSessionId] : undefined
  const sessionEnded = activeState?.ended ?? false
  const claudeResumeId = activeState?.resumeId ?? null

  const items = useMemo(
    () => buildItemList(sessions, sessionEnded, claudeResumeId, safetyMode, config),
    [sessions, sessionEnded, claudeResumeId, safetyMode, config],
  )

  const sectionHeaders = useMemo(() => computeSectionHeaders(items), [items])

  // Scroll focused item into view
  useEffect(() => {
    if (uiMode !== 'startMenu') return
    const container = listRef.current
    if (!container) return
    const focused = container.querySelector('.start-menu-item.focused')
    if (focused) {
      focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [startMenuFocusIndex, uiMode])

  if (uiMode !== 'startMenu') return null

  return (
    <div className="start-menu-overlay">
      <div className="start-menu">
        <div className="start-menu-header">DECKMIND</div>
        <div className="start-menu-list" ref={listRef}>
          {items.map((item, index) => {
            const header = sectionHeaders[index]
            const isFocused = index === startMenuFocusIndex
            const isActive = item.type === 'session' && item.sessionId === activeSessionId

            return (
              <div key={item.id}>
                {header && (
                  <div className="start-menu-section">{header}</div>
                )}
                <div
                  className={`start-menu-item${isFocused ? ' focused' : ''}${isActive ? ' active-session' : ''}`}
                  data-index={index}
                >
                  <span className="start-menu-item-icon">
                    {item.type === 'newSession' && '+'}
                    {item.type === 'resumeSession' && '\u25B6'}
                    {item.type === 'session' && (isActive ? '\u25B8' : '\u00B7')}
                    {item.type === 'action' && (MENU_ACTIONS.find(a => a.id === item.actionId)?.icon || '>')}
                    {item.type === 'setting' && '\u2699'}
                  </span>
                  <span className="start-menu-item-label">{item.label}</span>
                  {item.type === 'setting' && (
                    <span className="start-menu-item-value">{item.value}</span>
                  )}
                  {(item.type === 'session' || item.type === 'action' || item.type === 'resumeSession') && item.sublabel && (
                    <span className="start-menu-item-sublabel">{item.sublabel}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="start-menu-footer">
          <span>A Select</span>
          {sessions.length > 0 && <span>X Close Session</span>}
          <span>B Close</span>
        </div>
      </div>
    </div>
  )
}

/** Execute the focused item. Called from useGamepad. */
export async function executeStartMenuItem(item: StartMenuItem) {
  const state = useAppStore.getState()

  switch (item.type) {
    case 'newSession':
      state.setUIMode('newSession')
      break

    case 'resumeSession': {
      const { activeSessionId } = state
      if (!activeSessionId) return
      const ss = state.getSessionState(activeSessionId)
      try {
        const claudePath = await invoke<string>('get_claude_path', { sessionId: activeSessionId })
        const flags = await invoke<string>('get_session_flags', { sessionId: activeSessionId })
        const cmd = buildClaudeCommand(claudePath, flags, {
          resumeId: ss.resumeId ?? undefined,
        })
        state.setSessionEnded(activeSessionId, false)
        state.setClaudeResumeId(activeSessionId, null)
        state.setUIMode('terminal')
        await invoke('pty_write', { sessionId: activeSessionId, data: cmd + '\r' })
      } catch (e) {
        console.error('Failed to resume session:', e)
      }
      break
    }

    case 'session': {
      if (item.sessionId) {
        state.setActiveSession(item.sessionId)
        state.showToast(item.label)
        state.setUIMode('terminal')
      }
      break
    }

    case 'action': {
      if (!state.activeSessionId || !item.actionId) return
      state.setUIMode('terminal')
      if (item.actionId === 'interrupt') {
        try {
          await invoke('pty_write', { sessionId: state.activeSessionId, data: '\x03' })
        } catch (e) {
          console.error('Failed to interrupt:', e)
        }
      } else {
        try {
          const prompt = await invoke<string>('build_action_prompt', { action: item.actionId })
          state.setDraftText(prompt)
        } catch (e) {
          console.error('Failed to build action prompt:', e)
        }
      }
      break
    }

    case 'setting': {
      if (item.settingKey === 'safety_mode') {
        const currentIdx = SAFETY_MODES.indexOf(state.safetyMode)
        const nextMode = SAFETY_MODES[(currentIdx + 1) % SAFETY_MODES.length]
        state.setSafetyMode(nextMode)
        try {
          await invoke('set_safety_mode', { mode: nextMode })
        } catch (e) {
          console.error('Failed to set safety mode:', e)
        }
        if (state.activeSessionId) {
          await invoke('pty_write', { sessionId: state.activeSessionId, data: '\x1b[Z' }).catch(() => {})
        }
      } else if (item.settingKey === 'voice_enabled') {
        if (state.config) {
          const newConfig = { ...state.config, voice_enabled: !state.config.voice_enabled }
          state.setConfig(newConfig)
          try {
            await invoke('update_config', { newConfig })
          } catch (e) {
            console.error('Failed to update config:', e)
          }
        }
      } else if (item.settingKey === 'default_model') {
        if (state.config) {
          const current = state.config.default_model || null
          const idx = MODEL_CYCLE.indexOf(current)
          const next = MODEL_CYCLE[(idx + 1) % MODEL_CYCLE.length]
          const newConfig = { ...state.config, default_model: next }
          state.setConfig(newConfig)
          try {
            await invoke('update_config', { newConfig })
          } catch (e) {
            console.error('Failed to update config:', e)
          }
        }
      } else if (item.settingKey === 'default_effort') {
        if (state.config) {
          const current = state.config.default_effort || null
          const idx = EFFORT_CYCLE.indexOf(current)
          const next = EFFORT_CYCLE[(idx + 1) % EFFORT_CYCLE.length]
          const newConfig = { ...state.config, default_effort: next }
          state.setConfig(newConfig)
          try {
            await invoke('update_config', { newConfig })
          } catch (e) {
            console.error('Failed to update config:', e)
          }
        }
      }
      // theme: display-only for now (no cycling implemented)
      break
    }
  }
}
