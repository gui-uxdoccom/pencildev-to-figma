import React from 'react'
import { DoneMessage, LogMessage } from '../../../shared/types'

interface Props {
  result: DoneMessage
  logs: LogMessage[]
  onImportAnother: () => void
  onDone: () => void
}

export function ResultScreen({ result, logs, onImportAnother, onDone }: Props) {
  const { screensImported, fontWarnings, imageWarnings } = result
  const hasWarnings = fontWarnings.length > 0 || imageWarnings.length > 0

  return (
    <div className="screen result-screen">
      <div className="result-icon">✓</div>
      <h2 className="result-title">
        {screensImported} screen{screensImported !== 1 ? 's' : ''} imported
      </h2>
      <p className="result-subtitle">
        Your Pencil design is now on the "{getPageName()}" page in Figma.
      </p>

      {hasWarnings && (
        <div className="warnings-section">
          {fontWarnings.length > 0 && (
            <div className="warning-group">
              <div className="warning-group__title">
                ⚠ Font substitutions ({fontWarnings.length})
              </div>
              <div className="warning-list">
                {fontWarnings.map((w, i) => (
                  <div key={i} className="warning-item">
                    <span className="warning-original">{w.original.family} {w.original.style}</span>
                    <span className="warning-arrow">→</span>
                    <span className="warning-sub">{w.substituted.family} {w.substituted.style}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {imageWarnings.length > 0 && (
            <div className="warning-group">
              <div className="warning-group__title">
                ⚠ Image issues ({imageWarnings.length})
              </div>
              <div className="warning-list">
                {imageWarnings.map((w, i) => (
                  <div key={i} className="warning-item">
                    <span className="warning-original warning-original--truncate">
                      {shortUrl(w.url)}
                    </span>
                    <span className="warning-reason">{w.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {logs.length > 0 && (
        <details className="debug-log">
          <summary>Debug log ({logs.length} entries)</summary>
          <div className="debug-log__entries">
            {logs.map((entry, i) => (
              <div key={i} className={`debug-log__entry debug-log__entry--${entry.level}`}>
                <span className="debug-log__level">{entry.level}</span>
                <span className="debug-log__msg">{entry.message}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="result-footer">
        <button className="btn btn--primary" onClick={onDone}>
          Done
        </button>
        <button className="btn btn--secondary result-footer__secondary" onClick={onImportAnother}>
          Import another file
        </button>
      </div>
    </div>
  )
}

function getPageName(): string {
  // We can't access figma.currentPage from the UI iframe,
  // so we show a generic label.
  return 'your design'
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname.split('/').pop() || url
  } catch {
    return url.length > 40 ? url.slice(0, 37) + '…' : url
  }
}
