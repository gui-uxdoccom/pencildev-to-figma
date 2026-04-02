import React, { useState, useCallback } from 'react'
import { PencilScreen, ThumbStripe } from '../../../shared/types'

interface Props {
  fileName: string
  screens: PencilScreen[]
  versionWarning?: boolean
  onImport: (selectedIds: string[]) => void
  onBack: () => void
  imageRefsTotal?: number
  imageRefsFound?: number
}

export function PickerScreen({ fileName, screens, versionWarning, onImport, onBack, imageRefsTotal = 0, imageRefsFound = 0 }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(screens.map(s => s.id)))

  const toggleAll = useCallback(() => {
    if (selected.size === screens.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(screens.map(s => s.id)))
    }
  }, [selected, screens])

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const allSelected  = selected.size === screens.length
  const noneSelected = selected.size === 0

  return (
    <div className="screen picker-screen">
      <div className="picker-header">
        <button className="back-btn" onClick={onBack} title="Go back">←</button>
        <div className="picker-header-info">
          <div className="picker-filename">{fileName}</div>
          <div className="picker-count">
            {screens.length} screen{screens.length !== 1 ? 's' : ''}
            {imageRefsTotal > 0 && (
              imageRefsFound === imageRefsTotal
                ? <span className="picker-images picker-images--ok"> &middot; {imageRefsFound} image{imageRefsFound !== 1 ? 's' : ''} loaded</span>
                : imageRefsFound > 0
                ? <span className="picker-images picker-images--partial"> &middot; {imageRefsFound}/{imageRefsTotal} images found</span>
                : <span className="picker-images picker-images--none"> &middot; 0/{imageRefsTotal} images found</span>
            )}
          </div>
        </div>
      </div>

      {versionWarning && (
        <div className="version-warning-banner">
          ⚠ This file uses an older Pencil format — some elements may not import correctly.
        </div>
      )}

      {imageRefsTotal > 0 && imageRefsFound < imageRefsTotal && (
        <div className="version-warning-banner">
          ⚠ {imageRefsTotal - imageRefsFound} of {imageRefsTotal} referenced image{imageRefsTotal !== 1 ? 's' : ''} not found in the selected folder.
          {imageRefsFound === 0
            ? ' Make sure you select the folder containing both the .pen file and its images/ subfolder.'
            : ' Some images may be from a different Pencil session.'}
        </div>
      )}

      <div className="select-all-row">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            ref={el => {
              if (el) el.indeterminate = !allSelected && !noneSelected
            }}
          />
          <span>{allSelected ? 'Deselect all' : 'Select all'}</span>
        </label>
        <span className="selected-count">{selected.size} selected</span>
      </div>

      <div className="screen-list">
        {screens.length === 0 ? (
          <div className="empty-list">No screens found in this file.</div>
        ) : (
          screens.map(screen => (
            <label key={screen.id} className={`screen-item ${selected.has(screen.id) ? 'screen-item--checked' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(screen.id)}
                onChange={() => toggle(screen.id)}
              />
              <div className="screen-item__preview">
                <ScreenThumb screen={screen} />
              </div>
              <div className="screen-item__info">
                <div className="screen-item__name">{screen.name}</div>
                <div className="screen-item__size">
                  {screen.w > 0 && screen.h > 0
                    ? `${Math.round(screen.w)} × ${Math.round(screen.h)}`
                    : 'Unknown size'}
                </div>
              </div>
            </label>
          ))
        )}
      </div>

      <div className="picker-footer">
        <button
          className="btn btn--primary"
          disabled={noneSelected}
          onClick={() => onImport(Array.from(selected))}
        >
          Import {selected.size > 0 ? `${selected.size} screen${selected.size !== 1 ? 's' : ''}` : ''}
        </button>
      </div>
    </div>
  )
}

/** Renders a mini SVG thumbnail of a screen using its stripe data */
function ScreenThumb({ screen }: { screen: PencilScreen }) {
  const { w, h, bgColor, stripes } = screen

  // If no useful data, show a simple placeholder
  if (w <= 0 || h <= 0 || (!bgColor && (!stripes || stripes.length === 0))) {
    return (
      <svg viewBox="0 0 28 28" className="screen-thumb screen-thumb--empty">
        <rect width="28" height="28" rx="3" fill="var(--surface2)" />
        <text x="14" y="16" textAnchor="middle" fontSize="10" fill="var(--text-3)">?</text>
      </svg>
    )
  }

  // Calculate aspect ratio to fit within the 36x36 preview box
  const aspect = w / h
  const boxW = 36
  const boxH = 36
  let thumbW: number, thumbH: number
  if (aspect > 1) {
    thumbW = boxW
    thumbH = boxW / aspect
  } else {
    thumbH = boxH
    thumbW = boxH * aspect
  }

  // Round for crisp rendering
  thumbW = Math.round(thumbW)
  thumbH = Math.round(thumbH)

  const bg = bgColor || '#2c2c2c'

  return (
    <svg
      viewBox={`0 0 ${thumbW} ${thumbH}`}
      className="screen-thumb"
      style={{ width: thumbW, height: thumbH }}
    >
      <rect width={thumbW} height={thumbH} rx="2" fill={bg} />
      {stripes && stripes.map((stripe, i) => {
        // Calculate y position by summing previous stripes
        let y = 0
        for (let j = 0; j < i; j++) y += (stripes[j].ratio * thumbH)
        const h = stripe.ratio * thumbH
        return (
          <rect
            key={i}
            x={0}
            y={Math.round(y)}
            width={thumbW}
            height={Math.round(h)}
            fill={stripe.color}
          />
        )
      })}
    </svg>
  )
}
