import { useEffect, useState } from 'react'
import { useAppStore } from '../stores/appStore'

export function VoiceIndicator() {
  const { isRecordingVoice } = useAppStore()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isRecordingVoice) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 100) / 10)
    }, 100)
    return () => clearInterval(interval)
  }, [isRecordingVoice])

  if (!isRecordingVoice) return null

  return (
    <div className="voice-overlay">
      <span className="dot" />
      Recording... {elapsed.toFixed(1)}s — Release to send
    </div>
  )
}
