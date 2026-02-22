import { useAppStore } from '../stores/appStore'

export function SessionToast() {
  const toastMessage = useAppStore((s) => s.toastMessage)

  if (!toastMessage) return null

  const display = toastMessage.length > 40
    ? toastMessage.slice(0, 40) + '...'
    : toastMessage

  return (
    <div className="session-toast">{display}</div>
  )
}
