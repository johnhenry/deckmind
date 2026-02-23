import { useAppStore } from '../stores/appStore'
import { TerminalPane } from './TerminalPane'

export function SessionView() {
  const { activeSessionId } = useAppStore()

  if (!activeSessionId) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <div className="logo">DECKMIND</div>
          <div className="subtitle">
            AI Operator Console. Press Start to begin.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="main-content">
      <TerminalPane key={activeSessionId} sessionId={activeSessionId} />
    </div>
  )
}
