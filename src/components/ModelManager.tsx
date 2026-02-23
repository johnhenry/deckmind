import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../stores/appStore'
import type { WhisperModelInfo } from '../types'

export function ModelManager() {
  const {
    uiMode,
    config,
    modelManagerFocusIndex,
    modelList,
    modelDownloading,
    modelDownloadPercent,
    setModelList,
  } = useAppStore()

  const listRef = useRef<HTMLDivElement>(null)

  // Fetch model list on open
  useEffect(() => {
    if (uiMode !== 'modelManager') return
    invoke<WhisperModelInfo[]>('list_whisper_models')
      .then((models) => setModelList(models))
      .catch((e) => console.error('Failed to list models:', e))
  }, [uiMode, setModelList])

  // Refresh model list when download completes
  useEffect(() => {
    if (uiMode !== 'modelManager') return
    if (modelDownloading) return // still downloading
    invoke<WhisperModelInfo[]>('list_whisper_models')
      .then((models) => setModelList(models))
      .catch(() => {})
  }, [uiMode, modelDownloading, setModelList])

  // Scroll focused item into view
  useEffect(() => {
    if (uiMode !== 'modelManager') return
    const container = listRef.current
    if (!container) return
    const focused = container.querySelector('.model-entry.focused')
    if (focused) {
      focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [modelManagerFocusIndex, uiMode])

  if (uiMode !== 'modelManager') return null

  const activeModel = config?.whisper_model || 'base.en'

  return (
    <div className="model-manager-overlay">
      <div className="model-manager">
        <div className="model-manager-title">VOICE MODELS</div>
        <div className="model-manager-subtitle">
          Active: {activeModel}
        </div>
        <div className="model-manager-list" ref={listRef}>
          {modelList.map((model, index) => {
            const isFocused = index === modelManagerFocusIndex
            const isActive = model.name === activeModel
            const isDownloading = modelDownloading === model.name

            let status: string
            let statusClass: string
            if (isActive) {
              status = 'ACTIVE'
              statusClass = 'active'
            } else if (isDownloading) {
              status = `${modelDownloadPercent}%`
              statusClass = 'downloading'
            } else if (model.downloaded) {
              status = 'Ready'
              statusClass = 'ready'
            } else {
              status = '--'
              statusClass = 'not-downloaded'
            }

            return (
              <div
                key={model.name}
                className={`model-entry${isFocused ? ' focused' : ''}${isActive ? ' active' : ''}`}
              >
                <span className="model-entry-icon">
                  {isActive ? '\u25B8' : model.downloaded ? '\u2713' : '\u2193'}
                </span>
                <span className="model-entry-name">{model.name}</span>
                <span className="model-entry-size">{model.size_label}</span>
                <span className={`model-entry-status ${statusClass}`}>{status}</span>
                {isDownloading && (
                  <div className="model-progress-bar">
                    <div
                      className="model-progress-fill"
                      style={{ width: `${modelDownloadPercent}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="model-manager-footer">
          <span>A Select/Download</span>
          <span>X Cancel</span>
          <span>Y Delete</span>
          <span>B Back</span>
        </div>
      </div>
    </div>
  )
}
