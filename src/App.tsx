import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { SessionTabs } from './components/SessionTabs'
import { StatusDisplay } from './components/StatusDisplay'
import { SessionView } from './components/SessionView'
import { ControllerBar } from './components/ControllerBar'
import { ActionMenu } from './components/ActionMenu'
import { VoiceIndicator } from './components/VoiceIndicator'
import { TextInput } from './components/TextInput'
import { SettingsPanel } from './components/SettingsPanel'
import { useSession } from './hooks/useSession'
import { useKeyboard } from './hooks/useKeyboard'
import { useAppStore } from './stores/appStore'
import type { AppConfig } from './types'

function App() {
  const { setupListeners } = useSession()
  const { setConfig } = useAppStore()

  useKeyboard()

  useEffect(() => {
    setupListeners()

    // Load initial config
    invoke<AppConfig>('get_config')
      .then((config) => setConfig(config))
      .catch((e) => console.error('Failed to load config:', e))
  }, [setupListeners, setConfig])

  return (
    <div className="app">
      <div className="top-bar">
        <SessionTabs />
        <StatusDisplay />
      </div>
      <SessionView />
      <TextInput />
      <div className="controller-area">
        <ActionMenu />
        <ControllerBar />
      </div>
      <VoiceIndicator />
      <SettingsPanel />
    </div>
  )
}

export default App
