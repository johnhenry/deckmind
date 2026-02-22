import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useAppStore } from '../stores/appStore'
import '@xterm/xterm/css/xterm.css'

interface TerminalPaneProps {
  sessionId: string
}

export function TerminalPane({ sessionId }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const setTerminalInstance = useAppStore((s) => s.setTerminalInstance)

  const setupTerminal = useCallback(async () => {
    if (!containerRef.current || terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: '#0a0e17',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        cursorAccent: '#0a0e17',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        black: '#1e293b',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#38bdf8',
        magenta: '#a78bfa',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#64748b',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fde68a',
        brightBlue: '#7dd3fc',
        brightMagenta: '#c4b5fd',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
      allowTransparency: false,
      scrollback: 10000,
      convertEol: false,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(containerRef.current)

    // Try WebGL for performance, fall back gracefully
    try {
      const webglAddon = new WebglAddon()
      term.loadAddon(webglAddon)
    } catch {
      // WebGL not available, canvas renderer works fine
    }

    fitAddon.fit()
    terminalRef.current = term
    fitAddonRef.current = fitAddon
    setTerminalInstance(term)

    // Send keyboard input from xterm.js to the PTY
    term.onData((data: string) => {
      invoke('pty_write', { sessionId, data }).catch((e) =>
        console.error('PTY write failed:', e)
      )
    })

    // Listen for PTY output and write to xterm.js
    const unlisten = await listen<{ session_id: string; data: string }>(
      'session-output',
      (event) => {
        if (event.payload.session_id === sessionId) {
          term.write(event.payload.data)
        }
      }
    )
    unlistenRef.current = unlisten
  }, [sessionId, setTerminalInstance])

  useEffect(() => {
    setupTerminal()

    const handleResize = () => {
      fitAddonRef.current?.fit()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      unlistenRef.current?.()
      terminalRef.current?.dispose()
      terminalRef.current = null
      setTerminalInstance(null)
    }
  }, [setupTerminal])

  // Blur terminal when overlay is shown so xterm.js stops capturing keyboard input.
  // Re-focus when returning to terminal mode.
  const uiMode = useAppStore((s) => s.uiMode)
  useEffect(() => {
    const term = terminalRef.current
    if (!term) return
    if (uiMode === 'terminal') {
      term.focus()
    } else {
      term.blur()
    }
  }, [uiMode])

  // Re-fit when container size changes
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return

    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit()
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="terminal-pane"
      style={{ width: '100%', height: '100%' }}
    />
  )
}
