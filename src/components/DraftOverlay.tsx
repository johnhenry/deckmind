import { useAppStore } from '../stores/appStore'

export function DraftOverlay() {
  const draftText = useAppStore((s) => s.draftText)
  const uiMode = useAppStore((s) => s.uiMode)
  const activeSessionId = useAppStore((s) => s.activeSessionId)

  if (!draftText.trim() || uiMode !== 'terminal' || !activeSessionId) return null

  const lines = draftText.split('\n')
  const truncated = lines.length > 4
    ? lines.slice(0, 4).join('\n') + '...'
    : draftText

  return (
    <div className="draft-overlay">
      <span className="draft-overlay-label">DRAFT</span>
      <pre className="draft-overlay-text">{truncated}</pre>
    </div>
  )
}
