import { useMemo, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'
import { buildClaudeCommand } from '../utils/buildClaudeCommand'
import { MENU_ACTIONS } from '../types'
import type { StartMenuItem, SafetyMode, SessionInfo, AppConfig, CustomActionDef } from '../types'

const SAFETY_MODES: SafetyMode[] = ['observe', 'suggest', 'confirm', 'auto']
const TAB_NAMES = ['Sessions', 'Actions', 'Settings']

const MODEL_CYCLE: (string | null)[] = [null, 'sonnet', 'opus', 'haiku']
const EFFORT_CYCLE: (string | null)[] = [null, 'low', 'medium', 'high']

/** Build the focusable item list for a specific tab. Used by component and useGamepad. */
export function buildStartMenuItemsForTab(tab: number): StartMenuItem[] {
  const { sessions, activeSessionId, sessionStates, safetyMode, config } = useAppStore.getState()
  const activeState = activeSessionId ? sessionStates[activeSessionId] : undefined
  const sessionEnded = activeState?.ended ?? false
  const claudeResumeId = activeState?.resumeId ?? null

  switch (tab) {
    case 0: return buildSessionsTab(sessions, sessionEnded, claudeResumeId)
    case 1: return buildActionsTab(config)
    case 2: return buildSettingsTab(safetyMode, config)
    default: return []
  }
}

function buildSessionsTab(
  sessions: SessionInfo[],
  sessionEnded: boolean,
  claudeResumeId: string | null,
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

  return list
}

function buildActionsTab(config: AppConfig | null): StartMenuItem[] {
  const customActions = config?.custom_actions ?? []
  const overrideMap = new Map<string, CustomActionDef>()
  const newActions: CustomActionDef[] = []
  const builtinIds = new Set(MENU_ACTIONS.map(a => a.id))

  for (const ca of customActions) {
    if (builtinIds.has(ca.id as any)) {
      overrideMap.set(ca.id, ca)
    } else {
      newActions.push(ca)
    }
  }

  const items: StartMenuItem[] = MENU_ACTIONS.map((action) => {
    const override = overrideMap.get(action.id)
    if (override) {
      return {
        id: `action-${action.id}`,
        type: 'action' as const,
        label: override.label,
        sublabel: override.description ?? action.description,
        icon: override.icon ?? action.icon,
        actionId: action.id,
        customPrompt: override.prompt,
      }
    }
    return {
      id: `action-${action.id}`,
      type: 'action' as const,
      label: action.label,
      sublabel: action.description,
      icon: action.icon,
      actionId: action.id,
    }
  })

  for (const ca of newActions) {
    items.push({
      id: `action-${ca.id}`,
      type: 'action' as const,
      label: ca.label,
      sublabel: ca.description ?? '',
      icon: ca.icon ?? '>',
      customPrompt: ca.prompt,
    })
  }

  return items
}

function buildSettingsTab(
  safetyMode: SafetyMode,
  config: { voice_enabled: boolean; theme: string; default_model?: string | null; default_effort?: string | null; whisper_model?: string } | null,
): StartMenuItem[] {
  return [
    {
      id: 'setting-safety',
      type: 'setting',
      label: 'Safety Mode',
      settingKey: 'safety_mode',
      value: safetyMode,
    },
    {
      id: 'setting-voice',
      type: 'setting',
      label: 'Voice',
      settingKey: 'voice_enabled',
      value: config?.voice_enabled ? 'enabled' : 'disabled',
    },
    {
      id: 'setting-theme',
      type: 'setting',
      label: 'Theme',
      settingKey: 'theme',
      value: config?.theme || 'cyber',
    },
    {
      id: 'setting-model',
      type: 'setting',
      label: 'Model',
      settingKey: 'default_model',
      value: config?.default_model || 'default',
    },
    {
      id: 'setting-effort',
      type: 'setting',
      label: 'Effort',
      settingKey: 'default_effort',
      value: config?.default_effort || 'default',
    },
    {
      id: 'setting-whisper-model',
      type: 'setting',
      label: 'Whisper Model',
      settingKey: 'whisper_model',
      value: config?.whisper_model || 'base.en',
    },
  ]
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
    startMenuTab,
    setStartMenuTab,
  } = useAppStore()

  const listRef = useRef<HTMLDivElement>(null)

  const activeState = activeSessionId ? sessionStates[activeSessionId] : undefined
  const sessionEnded = activeState?.ended ?? false
  const claudeResumeId = activeState?.resumeId ?? null

  const items = useMemo(() => {
    switch (startMenuTab) {
      case 0: return buildSessionsTab(sessions, sessionEnded, claudeResumeId)
      case 1: return buildActionsTab(config)
      case 2: return buildSettingsTab(safetyMode, config)
      default: return []
    }
  }, [startMenuTab, sessions, sessionEnded, claudeResumeId, safetyMode, config])

  const actionsDisabled = !activeSessionId

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

  const footerHints = startMenuTab === 0
    ? (<><span>A Select</span>{sessions.length > 0 && <span>X Close Session</span>}<span>B Close</span></>)
    : startMenuTab === 1
    ? (<><span>A Execute</span><span>B Close</span></>)
    : (<><span>A Change</span><span>B Close</span></>)

  return (
    <div className="start-menu-overlay">
      <div className="start-menu">
        <div className="start-menu-header">DECKMIND</div>
        <div className="start-menu-tabs">
          {TAB_NAMES.map((name, i) => (
            <button
              key={name}
              className={`start-menu-tab${i === startMenuTab ? ' active' : ''}`}
              onClick={() => setStartMenuTab(i)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="start-menu-list" key={startMenuTab} ref={listRef}>
          {items.map((item, index) => {
            const isFocused = index === startMenuFocusIndex
            const isActive = item.type === 'session' && item.sessionId === activeSessionId
            const isDisabled = item.type === 'action' && actionsDisabled

            return (
              <div
                key={item.id}
                className={`start-menu-item${isFocused ? ' focused' : ''}${isActive ? ' active-session' : ''}${isDisabled ? ' disabled' : ''}`}
                data-index={index}
              >
                <span className="start-menu-item-icon">
                  {item.type === 'newSession' && '+'}
                  {item.type === 'resumeSession' && '\u25B6'}
                  {item.type === 'session' && (isActive ? '\u25B8' : '\u00B7')}
                  {item.type === 'action' && (item.icon || '>')}
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
            )
          })}
        </div>
        <div className="start-menu-footer">
          {footerHints}
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
      if (!state.activeSessionId) return
      state.setUIMode('terminal')
      if (item.actionId === 'interrupt') {
        try {
          await invoke('pty_write', { sessionId: state.activeSessionId, data: '\x03' })
        } catch (e) {
          console.error('Failed to interrupt:', e)
        }
      } else if (item.customPrompt) {
        try {
          const prompt = await invoke<string>('build_custom_prompt', { template: item.customPrompt })
          state.setDraftText(prompt)
        } catch (e) {
          console.error('Failed to build custom prompt:', e)
        }
      } else if (item.actionId) {
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
      else if (item.settingKey === 'whisper_model') {
        state.setUIMode('modelManager')
      }
      // theme: display-only for now (no cycling implemented)
      break
    }
  }
}
