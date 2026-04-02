import React, { useEffect, useRef, useState } from 'react'
import { ProgressMessage } from '../../../shared/types'

interface Props {
  progress: ProgressMessage | null
}

const PHASE_LABELS: Record<string, string> = {
  images: 'Fetching images',
  components: 'Creating components',
  screens: 'Importing design',
  layout: 'Arranging layout',
}

const PHASE_ICONS: Record<string, string> = {
  images: '🖼️',
  components: '🧩',
  screens: '🎨',
  layout: '📐',
}

function formatTime(ms: number): string {
  const secs = Math.ceil(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const rem = secs % 60
  return `${mins}m ${rem}s`
}

export function ProgressScreen({ progress }: Props) {
  const startRef = useRef<number>(Date.now())
  const [elapsed, setElapsed] = useState(0)

  // Reset start time when importing begins
  useEffect(() => {
    startRef.current = Date.now()
  }, [])

  // Tick elapsed time every second
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startRef.current), 1000)
    return () => clearInterval(timer)
  }, [])

  const percent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  // Estimate remaining time based on throughput so far
  let eta: string | null = null
  if (progress && progress.current > 0 && progress.current < progress.total) {
    const msPerItem = elapsed / progress.current
    const remaining = msPerItem * (progress.total - progress.current)
    eta = formatTime(remaining)
  }

  const phase = progress?.phase ?? 'screens'
  const phaseLabel = PHASE_LABELS[phase] ?? 'Importing'
  const phaseIcon = PHASE_ICONS[phase] ?? '⚙️'

  return (
    <div className="screen progress-screen">
      <div className="progress-icon">{phaseIcon}</div>
      <h2 className="progress-title">{phaseLabel}…</h2>

      {progress && (
        <>
          <div className="progress-step">{progress.step}</div>
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="progress-nums">
            {progress.current} / {progress.total} ({percent}%)
          </div>
        </>
      )}

      <div className="progress-time-row">
        <span className="progress-elapsed">Elapsed: {formatTime(elapsed)}</span>
        {eta && <span className="progress-eta">≈ {eta} remaining</span>}
      </div>

      <div className="progress-hint">Please keep Figma open during import.</div>
    </div>
  )
}
