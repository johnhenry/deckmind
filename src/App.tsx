import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { MinimalStatusBar } from './components/MinimalStatusBar'
import { SessionView } from './components/SessionView'
import { ControllerBar } from './components/ControllerBar'
import { StartMenu } from './components/StartMenu'
import { NewSessionDialog } from './components/NewSessionDialog'
import { DirectoryBrowser } from './components/DirectoryBrowser'
import { ModelManager } from './components/ModelManager'
import { ButtonRemapper } from './components/ButtonRemapper'
import { VoiceIndicator } from './components/VoiceIndicator'
import { SessionToast } from './components/SessionToast'
import { TextInput } from './components/TextInput'
import { useSession } from './hooks/useSession'
import { useKeyboard } from './hooks/useKeyboard'
import { useGamepad } from './hooks/useGamepad'
import { useAppStore } from './stores/appStore'
import type { AppConfig, DownloadProgress } from './types'

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

  // Global download progress listener (works even when model manager is closed)
  useEffect(() => {
    const unlisten = listen<DownloadProgress>('model-download-progress', (event) => {
      const { model_name, percent, done, error } = event.payload
      const store = useAppStore.getState()
      store.setModelDownloadPercent(percent)

      if (done) {
        store.setModelDownloading(null)
        store.setModelDownloadPercent(0)
        if (error) {
          store.setModelDownloadError(error)
          if (error !== 'Cancelled') {
            store.showToast(`Download failed: ${error}`)
          }
        } else {
          store.setModelDownloadError(null)
          store.showToast(`${model_name} downloaded`)
        }
      }
    })
    return () => { unlisten.then((fn) => fn()) }
  }, [])

  return (
    <div className="app">
      <MinimalStatusBar />
      <SessionView />
      <TextInput />
      <ControllerBar />
      <StartMenu />
      <NewSessionDialog />
      <DirectoryBrowser />
      <ModelManager />
      <ButtonRemapper />
      <VoiceIndicator />
      <SessionToast />
    </div>
  )
}

export default App
