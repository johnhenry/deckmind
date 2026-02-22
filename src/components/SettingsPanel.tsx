import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'
import type { SafetyMode, AppConfig } from '../types'

const SAFETY_MODES: SafetyMode[] = ['observe', 'suggest', 'confirm', 'auto']

export function SettingsPanel() {
  const { showSettings, setShowSettings, config, setConfig, safetyMode, setSafetyMode } = useAppStore()
  const [localConfig, setLocalConfig] = useState<AppConfig | null>(null)

  useEffect(() => {
    if (showSettings && config) {
      setLocalConfig({ ...config })
    }
  }, [showSettings, config])

  if (!showSettings) return null

  const handleSafetyModeChange = async (mode: SafetyMode) => {
    setSafetyMode(mode)
    try {
      await invoke('set_safety_mode', { mode })
    } catch (e) {
      console.error('Failed to set safety mode:', e)
    }
  }

  const handleSave = async () => {
    if (!localConfig) return
    try {
      await invoke('update_config', { newConfig: localConfig })
      setConfig(localConfig)
    } catch (e) {
      console.error('Failed to save config:', e)
    }
    setShowSettings(false)
  }

  return (
    <div className="settings-overlay" onClick={() => setShowSettings(false)}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <div className="settings-group">
          <h3>Safety Mode</h3>
          <div className="safety-mode-selector">
            {SAFETY_MODES.map((mode) => (
              <button
                key={mode}
                className={`safety-mode-btn ${mode === safetyMode ? 'selected' : ''}`}
                onClick={() => handleSafetyModeChange(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-group">
          <h3>Claude</h3>
          <div className="setting-row">
            <label>Claude CLI path</label>
            <input
              type="text"
              value={localConfig?.claude_path || ''}
              onChange={(e) =>
                setLocalConfig((c) => c ? { ...c, claude_path: e.target.value } : c)
              }
            />
          </div>
          <div className="setting-row">
            <label>Default directory</label>
            <input
              type="text"
              value={localConfig?.default_working_dir || ''}
              onChange={(e) =>
                setLocalConfig((c) =>
                  c ? { ...c, default_working_dir: e.target.value || null } : c
                )
              }
              placeholder="~/"
            />
          </div>
        </div>

        <div className="settings-group">
          <h3>Voice</h3>
          <div className="setting-row">
            <label>Voice enabled</label>
            <input
              type="checkbox"
              checked={localConfig?.voice_enabled ?? true}
              onChange={(e) =>
                setLocalConfig((c) => c ? { ...c, voice_enabled: e.target.checked } : c)
              }
            />
          </div>
          <div className="setting-row">
            <label>Whisper model</label>
            <select
              value={localConfig?.whisper_model || 'base.en'}
              onChange={(e) =>
                setLocalConfig((c) => c ? { ...c, whisper_model: e.target.value } : c)
              }
            >
              <option value="tiny.en">Tiny (English)</option>
              <option value="base.en">Base (English)</option>
              <option value="small.en">Small (English)</option>
              <option value="medium.en">Medium (English)</option>
            </select>
          </div>
        </div>

        <button className="close-settings-btn" onClick={handleSave}>
          Save & Close
        </button>
      </div>
    </div>
  )
}
