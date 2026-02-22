import { useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { useSession } from '../hooks/useSession'

export function NewSessionDialog() {
  const {
    uiMode,
    recentDirs,
    newSessionFieldIndex,
    newSessionDirIndex,
    newSessionName,
    setNewSessionName,
    newSessionCreateTrigger,
    newSessionWorktree,
    config,
  } = useAppStore()
  const { createSession } = useSession()

  const currentDir = newSessionDirIndex === -1 ? '' : (recentDirs[newSessionDirIndex] || '')

  const handleCreate = useCallback(async () => {
    // Read latest state to avoid stale closures
    const state = useAppStore.getState()
    const name = state.newSessionName
    const dirIdx = state.newSessionDirIndex
    const dir = dirIdx === -1 ? '' : (state.recentDirs[dirIdx] || '')

    // Build extra flags from session options + config defaults
    const flags: string[] = []
    if (state.newSessionContinue) flags.push('--continue')
    if (state.newSessionWorktree) flags.push('--worktree')
    const cfg = state.config
    if (cfg?.default_model) flags.push(`--model ${cfg.default_model}`)
    if (cfg?.default_effort) flags.push(`--effort ${cfg.default_effort}`)
    const extraFlags = flags.length > 0 ? flags.join(' ') : undefined

    try {
      await createSession(name || undefined, dir || undefined, extraFlags)
      if (dir) {
        useAppStore.getState().addRecentDir(dir)
      }
      useAppStore.getState().setUIMode('terminal')
    } catch (e) {
      console.error('Failed to create session:', e)
    }
  }, [createSession])

  // Watch for create trigger from useGamepad (A pressed on Create button)
  useEffect(() => {
    if (newSessionCreateTrigger === 0 || uiMode !== 'newSession') return
    handleCreate()
  }, [newSessionCreateTrigger, uiMode, handleCreate])

  if (uiMode !== 'newSession') return null

  // Build active flags summary for display
  const activeFlags: string[] = []
  if (newSessionWorktree) activeFlags.push('worktree')
  if (config?.default_model) activeFlags.push(config.default_model)
  if (config?.default_effort) activeFlags.push(config.default_effort)

  return (
    <div className="new-session-overlay">
      <div className="new-session-dialog">
        <div className="new-session-title">New Session</div>

        <div className={`new-session-field${newSessionFieldIndex === 0 ? ' focused' : ''}`}>
          <label>Name</label>
          <input
            type="text"
            inputMode="none"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            placeholder="Session name (optional)"
          />
        </div>

        <div className={`new-session-field${newSessionFieldIndex === 1 ? ' focused' : ''}`}>
          <label>Directory</label>
          <div className="dir-selector">
            <span className="dir-arrow">{'\u25C0'}</span>
            <span className="dir-value">{currentDir || '(default)'}</span>
            <span className="dir-arrow">{'\u25B6'}</span>
          </div>
          {newSessionFieldIndex === 1 && (
            <div className="field-hint">Y = Browse filesystem</div>
          )}
        </div>

        <div className={`new-session-field${newSessionFieldIndex === 2 ? ' focused' : ''}`}>
          <label>Worktree</label>
          <div className="worktree-toggle-row">
            <span className={`worktree-toggle${newSessionWorktree ? ' on' : ''}`}>
              {newSessionWorktree ? 'ON' : 'OFF'}
            </span>
            <span className="worktree-desc">Isolate in git worktree</span>
          </div>
        </div>

        <div className={`new-session-field new-session-action${newSessionFieldIndex === 3 ? ' focused' : ''}`}>
          <button className="create-btn" onClick={handleCreate}>
            Create Session
            {activeFlags.length > 0 && (
              <span className="create-flags"> ({activeFlags.join(', ')})</span>
            )}
          </button>
          {newSessionFieldIndex === 3 && (
            <div className="field-hint">Y = Continue last conversation</div>
          )}
        </div>

        <div className="new-session-footer">
          <span>A Create</span>
          <span>Y {newSessionFieldIndex === 1 ? 'Browse' : newSessionFieldIndex === 3 ? 'Continue' : ''}</span>
          <span>B Back</span>
        </div>
      </div>
    </div>
  )
}
