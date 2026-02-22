import { useEffect, useRef } from 'react'
import { useActions } from '../hooks/useActions'
import { useAppStore } from '../stores/appStore'
import { MENU_ACTIONS } from '../types'
import type { SemanticAction } from '../types'

export function ActionMenu() {
  const { sendAction } = useActions()
  const { showActionMenu, setShowActionMenu, activeSessionId } = useAppStore()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!showActionMenu) return

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowActionMenu(false)
      }
    }

    // Delay to avoid closing immediately from the R1 button click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [showActionMenu, setShowActionMenu])

  if (!showActionMenu) return null

  const handleAction = (action: SemanticAction) => {
    if (!activeSessionId) return
    sendAction(action)
    setShowActionMenu(false)
  }

  return (
    <div className="action-menu" ref={menuRef}>
      {MENU_ACTIONS.map((action) => (
        <button
          key={action.id}
          className="action-menu-item"
          onClick={() => handleAction(action.id)}
          disabled={!activeSessionId}
        >
          <span className="action-menu-icon">{action.icon}</span>
          <span className="action-menu-label">{action.label}</span>
          <span className="action-menu-shortcut">{action.shortcutLabel}</span>
        </button>
      ))}
    </div>
  )
}
