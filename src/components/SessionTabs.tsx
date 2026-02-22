import { useSession } from '../hooks/useSession'

export function SessionTabs() {
  const { sessions, activeSessionId, createSession, closeSession, setActiveSession } = useSession()

  return (
    <div className="session-tabs">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`session-tab ${session.id === activeSessionId ? 'active' : ''}`}
          onClick={() => setActiveSession(session.id)}
        >
          <span>{session.name}</span>
          {session.is_busy && <span className="busy-indicator" />}
          <button
            className="close-btn"
            onClick={(e) => {
              e.stopPropagation()
              closeSession(session.id)
            }}
          >
            x
          </button>
        </div>
      ))}
      <button
        className="new-session-btn"
        onClick={() => createSession()}
        title="New session"
      >
        +
      </button>
    </div>
  )
}
