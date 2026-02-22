import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'
import type { DirEntry } from '../types'

export function DirectoryBrowser() {
  const {
    uiMode,
    dirBrowserPath,
    dirBrowserEntries,
    dirBrowserFocusIndex,
    dirBrowserLoading,
    setDirBrowserEntries,
    setDirBrowserFocusIndex,
    setDirBrowserLoading,
    showToast,
  } = useAppStore()

  const listRef = useRef<HTMLDivElement>(null)

  // Fetch entries when path changes
  useEffect(() => {
    if (uiMode !== 'dirBrowser') return
    let cancelled = false
    setDirBrowserLoading(true)
    invoke<DirEntry[]>('list_directory', { path: dirBrowserPath || null })
      .then((entries) => {
        if (!cancelled) {
          setDirBrowserEntries(entries)
          setDirBrowserFocusIndex(0)
          setDirBrowserLoading(false)
        }
      })
      .catch((e) => {
        console.error('Failed to list directory:', e)
        if (!cancelled) {
          setDirBrowserLoading(false)
          showToast(`Cannot read directory`)
        }
      })
    return () => { cancelled = true }
  }, [dirBrowserPath, uiMode, setDirBrowserEntries, setDirBrowserFocusIndex, setDirBrowserLoading, showToast])

  // Scroll focused item into view
  useEffect(() => {
    if (uiMode !== 'dirBrowser') return
    const container = listRef.current
    if (!container) return
    const focused = container.querySelector('.dir-browser-entry.focused')
    if (focused) {
      focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [dirBrowserFocusIndex, uiMode])

  if (uiMode !== 'dirBrowser') return null

  return (
    <div className="dir-browser-overlay">
      <div className="dir-browser">
        <div className="dir-browser-title">SELECT DIRECTORY</div>
        <div className="dir-browser-header">{dirBrowserPath || '/'}</div>
        <div className="dir-browser-list" ref={listRef}>
          {dirBrowserLoading ? (
            <div className="dir-browser-loading">Loading...</div>
          ) : (
            dirBrowserEntries.map((entry, index) => (
              <div
                key={entry.path + entry.name}
                className={`dir-browser-entry${index === dirBrowserFocusIndex ? ' focused' : ''}${entry.is_dir ? ' is-dir' : ''}`}
              >
                <span className="dir-entry-icon">
                  {entry.name === '..' ? '\u2191' : entry.is_dir ? '\u25B8' : '\u00B7'}
                </span>
                <span className="dir-entry-name">
                  {entry.name}{entry.is_dir && entry.name !== '..' ? '/' : ''}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="dir-browser-footer">
          <span>A Enter</span>
          <span>X Select</span>
          <span>B Up</span>
          <span>Start Cancel</span>
        </div>
      </div>
    </div>
  )
}
