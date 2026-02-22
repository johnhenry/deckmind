import { useAppStore } from '../stores/appStore'

export function MinimalStatusBar() {
  const { sessions, activeSessionId, isBusy, safetyMode } = useAppStore()

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  if (!activeSession) {
    return (
      <div className="minimal-status-bar">
        <span className="status-bar-hint">No session — press Start</span>
      </div>
    )
  }

  // Truncate working dir for display
  const dir = activeSession.working_dir || ''
  const shortDir = dir.length > 40 ? '...' + dir.slice(-37) : dir

  return (
    <div className="minimal-status-bar">
      <span className="status-bar-name">{activeSession.name}</span>
      {shortDir && <span className="status-bar-dir">{shortDir}</span>}
      {isBusy && <span className="busy-indicator" />}
      <span className={`safety-badge ${safetyMode}`}>{safetyMode}</span>
    </div>
  )
}
