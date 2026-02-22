import { useAppStore } from '../stores/appStore'

export function StatusDisplay() {
  const { isBusy, setShowSettings } = useAppStore()

  return (
    <div className="status-area">
      {isBusy && <span className="busy-indicator" />}
      <button
        className="settings-btn"
        onClick={() => setShowSettings(true)}
        title="Settings"
      >
        *
      </button>
    </div>
  )
}
