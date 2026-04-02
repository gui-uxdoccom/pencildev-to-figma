import React, { useState, useCallback, useMemo } from 'react'
import { FontScanEntry, FontMappingMap, RequiredFont } from '../../../shared/types'

interface Props {
  entries: FontScanEntry[]
  onContinue: (mappings: FontMappingMap) => void
  onBack: () => void
}

export function FontMapScreen({ entries, onContinue, onBack }: Props) {
  const missingEntries = useMemo(
    () => entries.filter(e => !e.available),
    [entries]
  )
  const availableEntries = useMemo(
    () => entries.filter(e => e.available),
    [entries]
  )

  // State: mapping for each missing font. Key = "family::style", value = chosen RequiredFont
  const [mappings, setMappings] = useState<FontMappingMap>(() => {
    const initial: FontMappingMap = {}
    for (const entry of missingEntries) {
      const key = `${entry.required.family}::${entry.required.style}`
      // Default to first suggestion
      if (entry.suggestions.length > 0) {
        initial[key] = entry.suggestions[0]
      }
    }
    return initial
  })

  const handleChange = useCallback((key: string, value: string) => {
    // value is "family::style" encoded
    const [family, style] = value.split('::')
    setMappings(prev => ({ ...prev, [key]: { family, style } }))
  }, [])

  const handleContinue = useCallback(() => {
    onContinue(mappings)
  }, [mappings, onContinue])

  // If no missing fonts, show a quick "all good" screen
  if (missingEntries.length === 0) {
    return (
      <div className="screen fontmap-screen">
        <div className="fontmap-header">
          <button className="back-btn" onClick={onBack} title="Go back">←</button>
          <div>
            <div className="fontmap-title">Font Check</div>
            <div className="fontmap-subtitle">{entries.length} font{entries.length !== 1 ? 's' : ''} found</div>
          </div>
        </div>

        <div className="fontmap-allgood">
          <div className="fontmap-allgood__icon">✓</div>
          <div className="fontmap-allgood__text">All fonts are available</div>
          <div className="fontmap-allgood__hint">No substitutions needed.</div>
        </div>

        <div className="fontmap-footer">
          <button className="btn btn--primary" onClick={handleContinue}>
            Continue to import
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen fontmap-screen">
      <div className="fontmap-header">
        <button className="back-btn" onClick={onBack} title="Go back">←</button>
        <div>
          <div className="fontmap-title">Font Substitution</div>
          <div className="fontmap-subtitle">
            {missingEntries.length} missing font{missingEntries.length !== 1 ? 's' : ''}
            {availableEntries.length > 0 && ` · ${availableEntries.length} available`}
          </div>
        </div>
      </div>

      <div className="fontmap-info">
        Choose replacements for fonts not found in Figma. The import will use your selections.
      </div>

      <div className="fontmap-list">
        {missingEntries.map(entry => {
          const key = `${entry.required.family}::${entry.required.style}`
          const current = mappings[key]
          const currentValue = current ? `${current.family}::${current.style}` : ''

          return (
            <div key={key} className="fontmap-item">
              <div className="fontmap-item__missing">
                <span className="fontmap-item__badge">Missing</span>
                <span className="fontmap-item__family">{entry.required.family}</span>
                <span className="fontmap-item__style">{entry.required.style}</span>
              </div>
              <div className="fontmap-item__select-row">
                <span className="fontmap-item__arrow">→</span>
                <select
                  className="fontmap-select"
                  value={currentValue}
                  onChange={e => handleChange(key, e.target.value)}
                >
                  {entry.suggestions.length === 0 && (
                    <option value="">No suggestions</option>
                  )}
                  {entry.suggestions.map((s, i) => (
                    <option key={`${s.family}::${s.style}::${i}`} value={`${s.family}::${s.style}`}>
                      {s.family} — {s.style}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
      </div>

      {availableEntries.length > 0 && (
        <details className="fontmap-available">
          <summary>{availableEntries.length} available font{availableEntries.length !== 1 ? 's' : ''}</summary>
          <div className="fontmap-available__list">
            {availableEntries.map(entry => (
              <div key={`${entry.required.family}::${entry.required.style}`} className="fontmap-available__item">
                <span className="fontmap-available__check">✓</span>
                <span>{entry.required.family}</span>
                <span className="fontmap-available__style">{entry.required.style}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="fontmap-footer">
        <button className="btn btn--primary" onClick={handleContinue}>
          Continue with substitutions
        </button>
      </div>
    </div>
  )
}
