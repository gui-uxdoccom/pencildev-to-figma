import React, { useCallback, useEffect, useReducer } from 'react'
import { ConnectScreen }  from './screens/ConnectScreen'
import { PickerScreen }   from './screens/PickerScreen'
import { FontMapScreen }  from './screens/FontMapScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { ResultScreen }   from './screens/ResultScreen'
import {
  PenFile,
  PencilScreen,
  PencilNode,
  UIToPluginMessage,
  PluginToUIMessage,
  ProgressMessage,
  DoneMessage,
  FontScanEntry,
  FontMappingMap,
  PenFileLoadResult,
  ImageMap,
  LogMessage,
} from '../../shared/types'

// ─────────────────────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'connect' | 'pick' | 'fontcheck' | 'fontmap' | 'importing' | 'done' | 'error'

interface State {
  phase: Phase
  fileName: string
  penFile: PenFile | null
  screens: PencilScreen[]
  selectedIds: string[]
  versionWarning: boolean
  localImageMap: ImageMap
  localImageRefsTotal: number
  localImageRefsFound: number
  fontEntries: FontScanEntry[]
  fontMappings: FontMappingMap
  progress: ProgressMessage | null
  result: DoneMessage | null
  error: string | null
  logs: LogMessage[]
}

const initial: State = {
  phase: 'connect',
  fileName: '',
  penFile: null,
  screens: [],
  selectedIds: [],
  versionWarning: false,
  localImageMap: {},
  localImageRefsTotal: 0,
  localImageRefsFound: 0,
  fontEntries: [],
  fontMappings: {},
  progress: null,
  result: null,
  error: null,
  logs: [],
}

type Action =
  | { type: 'FILE_LOADED'; result: PenFileLoadResult }
  | { type: 'BACK' }
  | { type: 'START_FONT_CHECK'; selectedIds: string[] }
  | { type: 'FONT_SCAN_RESULT'; entries: FontScanEntry[] }
  | { type: 'FONT_MAP_DONE'; mappings: FontMappingMap }
  | { type: 'BACK_TO_PICK' }
  | { type: 'START_IMPORT' }
  | { type: 'PROGRESS'; msg: ProgressMessage }
  | { type: 'DONE'; msg: DoneMessage }
  | { type: 'ERROR'; message: string }
  | { type: 'LOG'; entry: LogMessage }
  | { type: 'RESET' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FILE_LOADED': {
      const { fileName, penFile, screens, versionWarning, localImageMap, localImageRefsTotal, localImageRefsFound } = action.result
      return {
        ...state,
        phase: 'pick',
        fileName,
        penFile,
        screens,
        versionWarning,
        localImageMap,
        localImageRefsTotal,
        localImageRefsFound,
      }
    }
    case 'BACK':
      return { ...state, phase: 'connect', penFile: null, screens: [], selectedIds: [], localImageMap: {}, localImageRefsTotal: 0, localImageRefsFound: 0, fontEntries: [], progress: null }
    case 'START_FONT_CHECK':
      return { ...state, phase: 'fontcheck', selectedIds: action.selectedIds }
    case 'FONT_SCAN_RESULT':
      return { ...state, phase: 'fontmap', fontEntries: action.entries }
    case 'FONT_MAP_DONE':
      return { ...state, fontMappings: action.mappings, phase: 'importing', progress: null, logs: [] }
    case 'BACK_TO_PICK':
      return { ...state, phase: 'pick', fontEntries: [], fontMappings: {} }
    case 'START_IMPORT':
      return { ...state, phase: 'importing', progress: null, logs: [] }
    case 'PROGRESS':
      return { ...state, progress: action.msg }
    case 'DONE':
      return { ...state, phase: 'done', result: action.msg }
    case 'ERROR':
      return { ...state, phase: 'error', error: action.message }
    case 'LOG':
      return { ...state, logs: [...state.logs, action.entry] }
    case 'RESET':
      return initial
    default:
      return state
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

export function App() {
  const [state, dispatch] = useReducer(reducer, initial)

  // Listen for messages from plugin main
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data?.pluginMessage as PluginToUIMessage | undefined
      if (!msg) return

      if (msg.type === 'PROGRESS')          dispatch({ type: 'PROGRESS', msg })
      if (msg.type === 'DONE')              dispatch({ type: 'DONE', msg })
      if (msg.type === 'ERROR')             dispatch({ type: 'ERROR', message: msg.message })
      if (msg.type === 'LOG')               dispatch({ type: 'LOG', entry: msg })
      if (msg.type === 'FONT_SCAN_RESULT')  dispatch({ type: 'FONT_SCAN_RESULT', entries: msg.entries })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const handleFileLoaded = useCallback(
    (result: PenFileLoadResult) => {
      dispatch({ type: 'FILE_LOADED', result })
    },
    []
  )

  // After user picks screens, trigger font scan
  const handlePickDone = useCallback(
    (selectedIds: string[]) => {
      if (!state.penFile) return
      dispatch({ type: 'START_FONT_CHECK', selectedIds })

      const msg: UIToPluginMessage = {
        type: 'SCAN_FONTS',
        tree: state.penFile,
        selectedScreenIds: selectedIds,
      }
      parent.postMessage({ pluginMessage: msg }, '*')
    },
    [state.penFile]
  )

  // After user maps fonts, start the actual import
  const handleFontMapDone = useCallback(
    async (mappings: FontMappingMap) => {
      if (!state.penFile) return
      dispatch({ type: 'FONT_MAP_DONE', mappings })

      // Collect images — start with the locally loaded ones, then fetch any remaining URLs
      const selectedNodes = (state.penFile.children ?? []).filter(n =>
        state.selectedIds.includes(n.id)
      )

      const imageMap = await collectImages(selectedNodes, state.localImageMap, (current, total) => {
        dispatch({
          type: 'PROGRESS',
          msg: {
            type: 'PROGRESS',
            step: `Fetching image ${current} of ${total}`,
            current,
            total,
            phase: 'images',
          },
        })
      })

      const msg: UIToPluginMessage = {
        type: 'DESIGN_PAYLOAD',
        fileName: state.fileName,
        tree: state.penFile,
        selectedScreenIds: state.selectedIds,
        imageMap,
        fontMappings: mappings,
      }

      parent.postMessage({ pluginMessage: msg }, '*')
    },
    [state.penFile, state.fileName, state.selectedIds, state.localImageMap]
  )

  if (state.phase === 'connect') {
    return <ConnectScreen onFileLoaded={handleFileLoaded} />
  }

  if (state.phase === 'pick') {
    return (
      <PickerScreen
        fileName={state.fileName}
        screens={state.screens}
        versionWarning={state.versionWarning}
        onImport={handlePickDone}
        onBack={() => dispatch({ type: 'BACK' })}
        imageRefsTotal={state.localImageRefsTotal}
        imageRefsFound={state.localImageRefsFound}
      />
    )
  }

  if (state.phase === 'fontcheck') {
    return (
      <div className="screen progress-screen">
        <div className="progress-icon">&#x27F3;</div>
        <div className="progress-title">Checking fonts...</div>
        <div className="progress-step">Scanning available fonts in Figma</div>
      </div>
    )
  }

  if (state.phase === 'fontmap') {
    return (
      <FontMapScreen
        entries={state.fontEntries}
        onContinue={handleFontMapDone}
        onBack={() => dispatch({ type: 'BACK_TO_PICK' })}
      />
    )
  }

  if (state.phase === 'importing') {
    return <ProgressScreen progress={state.progress} />
  }

  if (state.phase === 'done' && state.result) {
    return (
      <ResultScreen
        result={state.result}
        logs={state.logs}
        onImportAnother={() => dispatch({ type: 'RESET' })}
        onDone={() => parent.postMessage({ pluginMessage: { type: 'CANCEL' } }, '*')}
      />
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="screen error-screen">
        <div className="error-icon">&#x2715;</div>
        <h2 className="error-title">Import failed</h2>
        <p className="error-message">{state.error}</p>
        {state.logs.length > 0 && (
          <details className="debug-log">
            <summary>Debug log ({state.logs.length} entries)</summary>
            <div className="debug-log__entries">
              {state.logs.map((entry, i) => (
                <div key={i} className={`debug-log__entry debug-log__entry--${entry.level}`}>
                  <span className="debug-log__level">{entry.level}</span>
                  <span className="debug-log__msg">{entry.message}</span>
                </div>
              ))}
            </div>
          </details>
        )}
        <button className="btn btn--primary" onClick={() => dispatch({ type: 'RESET' })}>
          Try again
        </button>
      </div>
    )
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Image collection + fetching (runs in UI iframe which has fetch access)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collects images for the selected screens. Uses locally loaded images first
 * (from folder drop), then falls back to fetch for any remaining URLs.
 */
async function collectImages(
  nodes: PencilNode[],
  localImageMap: ImageMap,
  onProgress?: (current: number, total: number) => void
): Promise<ImageMap> {
  const urls = new Set<string>()
  walkForImages(nodes, urls)

  const total = urls.size
  const map: ImageMap = { ...localImageMap }
  let done = 0

  if (total > 0) onProgress?.(0, total)

  await Promise.all(
    Array.from(urls).map(async (url) => {
      // Skip if already loaded from local files
      if (map[url]) {
        done++
        onProgress?.(done, total)
        return
      }

      // Only try to fetch non-local URLs (http/https/data URIs)
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        try {
          const b64 = await fetchImageAsBase64(url)
          if (b64) map[url] = b64
        } catch {
          // Failures are handled gracefully in the plugin sandbox via imageWarnings
        }
      }
      done++
      onProgress?.(done, total)
    })
  )
  return map
}

function walkForImages(nodes: PencilNode[] | undefined, out: Set<string>) {
  if (!nodes) return
  for (const node of nodes) {
    // Handle single fill or fill array
    const fill = (node as any).fill
    if (fill) {
      if (Array.isArray(fill)) {
        for (const f of fill) {
          if (f && typeof f === 'object' && f.type === 'image' && f.url) {
            out.add(f.url)
          }
        }
      } else if (typeof fill === 'object' && fill.type === 'image' && fill.url) {
        out.add(fill.url)
      }
    }
    walkForImages(node.children, out)
  }
}

/**
 * Rasterises a Blob to PNG using an offscreen canvas.
 * Used to convert SVG and WebP (unsupported by Figma's createImage) to PNG.
 */
function rasteriseToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || img.width || 300
      const h = img.naturalHeight || img.height || 150
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx2d = canvas.getContext('2d')
      if (!ctx2d) { URL.revokeObjectURL(url); reject(new Error('canvas 2d unavailable')); return }
      ctx2d.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (pngBlob) => pngBlob ? resolve(pngBlob) : reject(new Error('toBlob failed')),
        'image/png'
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')) }
    img.src = url
  })
}

function needsConversion(mime: string): boolean {
  return mime.includes('image/svg') || mime.includes('image/webp')
}

async function fetchImageAsBase64(urlOrData: string): Promise<string | null> {
  // Convert existing data URIs that are SVG/WebP to PNG
  if (urlOrData.startsWith('data:')) {
    const mimeMatch = urlOrData.match(/^data:([^;,]+)/)
    const mime = mimeMatch ? mimeMatch[1].toLowerCase() : ''
    if (needsConversion(mime)) {
      try {
        const res = await fetch(urlOrData)
        const blob = await res.blob()
        const pngBlob = await rasteriseToPng(blob)
        const buf = await pngBlob.arrayBuffer()
        return arrayBufferToDataUri(buf, 'image/png')
      } catch {
        return null
      }
    }
    return urlOrData
  }

  // Try fetch with cors, fall back to no-cors
  let res: Response
  try {
    res = await fetch(urlOrData, { mode: 'cors' })
  } catch {
    // CORS blocked — try without cors mode (will get opaque response on some browsers)
    try {
      res = await fetch(urlOrData)
    } catch {
      return null
    }
  }

  if (!res.ok) return null

  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)

  // Validate we got actual image data, not an HTML error page
  if (bytes.length < 8) return null
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('text/html')) return null

  let mime = contentType.split(';')[0].trim() || 'image/png'

  // Convert unsupported formats (SVG, WebP) to PNG via canvas
  if (needsConversion(mime)) {
    try {
      const blob = new Blob([buf], { type: mime })
      const pngBlob = await rasteriseToPng(blob)
      const pngBuf = await pngBlob.arrayBuffer()
      return arrayBufferToDataUri(pngBuf, 'image/png')
    } catch {
      return null
    }
  }

  return arrayBufferToDataUri(buf, mime)
}

function arrayBufferToDataUri(buf: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
    binary += String.fromCharCode.apply(null, Array.from(slice))
  }
  return `data:${mime};base64,${btoa(binary)}`
}
