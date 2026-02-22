import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { MinimalStatusBar } from './components/MinimalStatusBar'
import { SessionView } from './components/SessionView'
import { ControllerBar } from './components/ControllerBar'
import { StartMenu } from './components/StartMenu'
import { NewSessionDialog } from './components/NewSessionDialog'
import { DirectoryBrowser } from './components/DirectoryBrowser'
import { VoiceIndicator } from './components/VoiceIndicator'
import { SessionToast } from './components/SessionToast'
import { TextInput } from './components/TextInput'
import { useSession } from './hooks/useSession'
import { useKeyboard } from './hooks/useKeyboard'
import { useGamepad } from './hooks/useGamepad'
import { useAppStore } from './stores/appStore'
import type { AppConfig } from './types'

function App() {
  const { setupListeners } = useSession()
  const { setConfig } = useAppStore()

  useKeyboard()
  useGamepad()

  useEffect(() => {
    setupListeners()

    // Load initial config
    invoke<AppConfig>('get_config')
      .then((config) => setConfig(config))
      .catch((e) => console.error('Failed to load config:', e))
  }, [setupListeners, setConfig])

  return (
    <div className="app">
      <MinimalStatusBar />
      <SessionView />
      <TextInput />
      <ControllerBar />
      <StartMenu />
      <NewSessionDialog />
      <DirectoryBrowser />
      <VoiceIndicator />
      <SessionToast />
    </div>
  )
}

export default App
