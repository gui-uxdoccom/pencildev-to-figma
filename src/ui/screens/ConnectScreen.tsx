import React, { useCallback, useRef, useState } from 'react'
import { PenFile, PencilScreen, PencilNode, ThumbStripe, ImageMap, PenFileLoadResult } from '../../../shared/types'

interface Props {
  onFileLoaded: (result: PenFileLoadResult) => void
}

export function ConnectScreen({ onFileLoaded }: Props) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [penFileChoices, setPenFileChoices] = useState<{ file: File; allFiles: File[] }[] | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(
    async (files: File[]) => {
      setLoading(true)
      setError(null)
      setPenFileChoices(null)

      try {
        // Find all .pen files
        const penFiles = files.filter(f => f.name.endsWith('.pen'))
        if (penFiles.length === 0) {
          setError('No .pen file found. Please select a folder containing a .pen file, or drop the .pen file directly.')
          setLoading(false)
          return
        }

        // If multiple .pen files, let the user choose
        if (penFiles.length > 1) {
          setPenFileChoices(penFiles.map(f => ({ file: f, allFiles: files })))
          setLoading(false)
          return
        }

        await loadPenFile(penFiles[0], files)
      } catch (e) {
        setError('Failed to parse .pen file. Make sure it is a valid Pencil design file.')
        setLoading(false)
      }
    },
    [onFileLoaded]
  )

  const loadPenFile = useCallback(
    async (penFile: File, allFiles: File[]) => {
      setLoading(true)
      setError(null)
      setPenFileChoices(null)

      try {
        // Read the .pen JSON
        const penText = await readFileAsText(penFile)
        const json = JSON.parse(penText)
        if (!json || typeof json !== 'object' || !Array.isArray(json.children)) {
          throw new Error('Invalid .pen file: missing expected structure')
        }
        const screens = extractScreens(json as PenFile)
        const versionWarning = isOldVersion(json.version)

        // Collect all image URLs referenced by the .pen file
        const referencedUrls = new Set<string>()
        walkForImageUrls(json.children ?? [], referencedUrls)

        // Separate local refs from remote URLs
        const localRefs: string[] = []
        for (const url of referencedUrls) {
          if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:')) {
            localRefs.push(url)
          }
        }

        // Read matching image files into an ImageMap
        const imageFiles = allFiles.filter(f => isImageFile(f))
        const localImageMap: ImageMap = {}
        let localImageRefsFound = 0

        if (imageFiles.length > 0 && localRefs.length > 0) {
          // Build a lookup from filename → File for quick matching
          const filesByName = new Map<string, File>()
          for (const imgFile of imageFiles) {
            filesByName.set(imgFile.name, imgFile)
          }

          // For each referenced URL, try to match it to a local file
          for (const url of localRefs) {
            const fileName = url.split('/').pop()
            if (!fileName) continue

            const file = filesByName.get(fileName)
            if (file) {
              try {
                const b64 = await readFileAsBase64(file)
                localImageMap[url] = b64
                localImageRefsFound++
              } catch {
                // Skip unreadable images
              }
            }
          }
        }

        onFileLoaded({
          fileName: penFile.name,
          penFile: json,
          screens,
          versionWarning,
          localImageMap,
          localImageRefsTotal: localRefs.length,
          localImageRefsFound,
        })
      } catch {
        setError('Failed to parse .pen file. Make sure it is a valid Pencil design file.')
      } finally {
        setLoading(false)
      }
    },
    [onFileLoaded]
  )

  const handlePenChoice = useCallback(
    (choice: { file: File; allFiles: File[] }) => {
      loadPenFile(choice.file, choice.allFiles)
    },
    [loadPenFile]
  )

  // Handle folder drops via DataTransfer with webkitGetAsEntry for deep traversal
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)

      const items = e.dataTransfer.items
      if (items && items.length > 0) {
        setLoading(true)
        setError(null)
        try {
          const files = await getAllFilesFromDrop(items)
          if (files.length === 0) {
            setError('No files found in the drop.')
            setLoading(false)
            return
          }
          await processFiles(files)
        } catch {
          setError('Failed to read dropped files.')
          setLoading(false)
        }
        return
      }

      // Fallback: plain file drop
      const fileList = Array.from(e.dataTransfer.files)
      if (fileList.length > 0) {
        await processFiles(fileList)
      }
    },
    [processFiles]
  )

  const onInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files
      if (fileList && fileList.length > 0) {
        await processFiles(Array.from(fileList))
      }
      // Reset the input so re-selecting the same folder works
      e.target.value = ''
    },
    [processFiles]
  )

  // If multiple .pen files found, show a chooser
  if (penFileChoices && penFileChoices.length > 1) {
    return (
      <div className="screen connect-screen">
        <h1 className="title">Multiple .pen files found</h1>
        <p className="subtitle">Choose which file to import:</p>
        <div className="pen-choice-list">
          {penFileChoices.map((choice, i) => (
            <button
              key={i}
              className="pen-choice-item"
              onClick={() => handlePenChoice(choice)}
            >
              <span className="pen-choice-icon">&#x1F4C4;</span>
              <span className="pen-choice-name">{choice.file.name}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <button
            className="btn btn--secondary"
            onClick={() => { setPenFileChoices(null); setError(null) }}
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen connect-screen">
      <div className="logo-row">
        <div className="logo-badge pencil-badge">P</div>
        <div className="logo-arrow">&rarr;</div>
        <div className="logo-badge figma-badge">F</div>
      </div>

      <h1 className="title">Pencil to Figma</h1>
      <p className="subtitle">
        Import your Pencil design into Figma with images and fonts intact.
      </p>

      <div
        className={`drop-zone ${dragging ? 'drop-zone--active' : ''} ${loading ? 'drop-zone--loading' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {loading ? (
          <div className="drop-zone__icon">&#x23F3;</div>
        ) : (
          <div className="drop-zone__icon">&#x1F4C2;</div>
        )}
        <div className="drop-zone__text">
          {loading
            ? 'Reading files\u2026'
            : dragging
            ? 'Drop to load'
            : 'Drop your .pen file or project folder'}
        </div>
        {!loading && !dragging && (
          <div className="drop-zone__hint">Drag &amp; drop supports both files and folders</div>
        )}
      </div>

      <div className="browse-buttons">
        <button
          className="btn btn--primary"
          disabled={loading}
          onClick={() => folderInputRef.current?.click()}
        >
          Browse folder (with images)
        </button>
        <button
          className="btn btn--secondary"
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
        >
          Browse .pen file only
        </button>
      </div>

      {/* Hidden folder input */}
      <input
        ref={folderInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={onInputChange}
        {...{ webkitdirectory: '', directory: '' } as any}
        multiple
      />
      {/* Hidden single file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pen"
        style={{ display: 'none' }}
        onChange={onInputChange}
      />

      {error && <div className="error-banner">{error}</div>}

      <div className="footnote">
        Select the folder to include images, or just the .pen file
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Walk .pen tree to collect all referenced image URLs
// ─────────────────────────────────────────────────────────────────────────────

function walkForImageUrls(nodes: PencilNode[] | undefined, out: Set<string>): void {
  if (!nodes) return
  for (const node of nodes) {
    const fill = (node as any).fill
    if (fill) {
      if (Array.isArray(fill)) {
        for (const f of fill) {
          if (f && typeof f === 'object' && f.type === 'image' && f.url) out.add(f.url)
        }
      } else if (typeof fill === 'object' && fill.type === 'image' && fill.url) {
        out.add(fill.url)
      }
    }
    walkForImageUrls(node.children, out)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// File reading helpers
// ─────────────────────────────────────────────────────────────────────────────

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function isImageFile(file: File): boolean {
  const ext = file.name.toLowerCase()
  return /\.(png|jpg|jpeg|gif|webp|svg)$/.test(ext)
}

// ─────────────────────────────────────────────────────────────────────────────
// Recursive folder traversal for drag & drop
// ─────────────────────────────────────────────────────────────────────────────

async function getAllFilesFromDrop(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = []
  const entries: FileSystemEntry[] = []

  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.()
    if (entry) {
      entries.push(entry)
    } else {
      const file = items[i].getAsFile()
      if (file) files.push(file)
    }
  }

  for (const entry of entries) {
    await traverseEntry(entry, files)
  }

  return files
}

async function traverseEntry(entry: FileSystemEntry, files: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await getFile(entry as FileSystemFileEntry)
    Object.defineProperty(file, 'webkitRelativePath', {
      value: entry.fullPath.replace(/^\//, ''),
      writable: false,
    })
    files.push(file)
  } else if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader()
    const entries = await readAllEntries(dirReader)
    for (const childEntry of entries) {
      await traverseEntry(childEntry, files)
    }
  }
}

function getFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    function readBatch() {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(all)
        } else {
          all.push(...entries)
          readBatch()
        }
      }, reject)
    }
    readBatch()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// .pen parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

function isOldVersion(version: string | undefined): boolean {
  if (!version) return true
  const [major, minor] = version.split('.').map(Number)
  if (isNaN(major)) return true
  if (major < 2) return true
  if (major === 2 && (isNaN(minor) || minor < 9)) return true
  return false
}

function extractScreens(file: PenFile): PencilScreen[] {
  return (file.children ?? [])
    .filter(n => n.type === 'frame' || n.type === 'group')
    .map(n => ({
      id: n.id,
      name: n.name || n.type,
      w: typeof n.width  === 'number' ? n.width  : 0,
      h: typeof n.height === 'number' ? n.height : 0,
      bgColor: extractColor(n),
      stripes: extractStripes(n),
    }))
}

function extractColor(node: PencilNode): string | undefined {
  const fill = (node as any).fill
  if (!fill) return undefined
  if (typeof fill === 'string') return fill
  if (fill.type === 'color' && fill.color) return fill.color
  return undefined
}

function extractStripes(screen: PencilNode): ThumbStripe[] {
  const children = screen.children
  if (!children || children.length === 0) return []

  const screenH = typeof screen.height === 'number' ? screen.height : 0
  if (screenH <= 0) return []

  const stripes: ThumbStripe[] = []
  for (const child of children) {
    const childH = typeof child.height === 'number' ? child.height : 0
    if (childH <= 0) continue

    const color = extractColor(child)
    if (color) {
      stripes.push({ ratio: childH / screenH, color })
    }
  }
  return stripes
}
