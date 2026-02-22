import { useSession } from '../hooks/useSession'
import { TerminalPane } from './TerminalPane'

export function SessionView() {
  const { activeSessionId, createSession } = useSession()

  if (!activeSessionId) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <div className="logo">DECKMIND</div>
          <div className="subtitle">
            AI Operator Console. Press + to create a session, or press any action button to begin.
          </div>
          <button
            className="action-btn"
            onClick={() => createSession()}
            style={{ minWidth: 120 }}
          >
            <span className="icon">+</span>
            <span className="label">New Session</span>
          </button>
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
