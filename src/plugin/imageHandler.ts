import { ImageMap, ImageWarning } from '../../shared/types'

// Figma plugin sandbox supports atob/btoa but they're not in the ES2017 lib.
declare function atob(data: string): string

const MAX_IMAGE_BYTES = 4096 * 4096 * 4 // rough upper bound

// Known PNG/JPEG/GIF magic bytes — the only formats figma.createImage supports
const PNG_MAGIC  = [0x89, 0x50, 0x4E, 0x47] // \x89PNG
const JPEG_MAGIC = [0xFF, 0xD8, 0xFF]
const GIF_MAGIC  = [0x47, 0x49, 0x46]         // GIF

function looksLikeImage(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  const b = bytes

  if (b[0] === PNG_MAGIC[0] && b[1] === PNG_MAGIC[1] && b[2] === PNG_MAGIC[2] && b[3] === PNG_MAGIC[3]) return true
  if (b[0] === JPEG_MAGIC[0] && b[1] === JPEG_MAGIC[1] && b[2] === JPEG_MAGIC[2]) return true
  if (b[0] === GIF_MAGIC[0] && b[1] === GIF_MAGIC[1] && b[2] === GIF_MAGIC[2]) return true

  return false
}

/**
 * Converts a base64 data URI or raw base64 string to a Uint8Array.
 */
export function base64ToBytes(b64: string): Uint8Array {
  // Strip the data URI prefix if present — handle any MIME subtype (svg+xml, x-png, etc.)
  const raw = b64.replace(/^data:[^;]+;base64,/, '')
  const binary = atob(raw)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Creates a Figma Image from a base64 string stored in imageMap.
 * Returns { hash } on success or null on failure (adds a warning).
 *
 * Tries figma.createImage (sync) first; falls back to figma.createImageAsync
 * for HTTP URLs when the sync API is unavailable at runtime.
 */
export async function createFigmaImage(
  key: string,
  imageMap: ImageMap,
  warnings: ImageWarning[]
): Promise<Image | null> {
  const b64 = imageMap[key]
  if (!b64) {
    warnings.push({ url: key, reason: 'Image data not found in payload' })
    return null
  }

  try {
    const bytes = base64ToBytes(b64)

    if (bytes.length === 0) {
      warnings.push({ url: key, reason: 'Image data is empty' })
      return null
    }

    if (!looksLikeImage(bytes)) {
      warnings.push({ url: key, reason: 'Data does not appear to be a valid image (bad magic bytes)' })
      return null
    }

    if (bytes.length > MAX_IMAGE_BYTES) {
      warnings.push({ url: key, reason: 'Image exceeds maximum allowed size (4096x4096)' })
      return null
    }

    // Prefer the synchronous API when available
    if (typeof figma.createImage === 'function') {
      return figma.createImage(bytes)
    }

    // Fallback: use async API with the original URL (only works for http(s) URLs)
    if (typeof figma.createImageAsync === 'function' && /^https?:\/\//.test(key)) {
      return await figma.createImageAsync(key)
    }

    warnings.push({ url: key, reason: 'Figma image API is unavailable in this environment' })
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // If the sync API threw, try the async fallback for HTTP URLs
    if (typeof figma.createImageAsync === 'function' && /^https?:\/\//.test(key)) {
      try {
        return await figma.createImageAsync(key)
      } catch (asyncErr) {
        const asyncMsg = asyncErr instanceof Error ? asyncErr.message : String(asyncErr)
        warnings.push({ url: key, reason: `Failed to create image (async fallback): ${asyncMsg}` })
        return null
      }
    }

    warnings.push({
      url: key,
      reason: `Failed to create image: ${message}`,
    })
    return null
  }
}

/**
 * Applies an image fill to a node.
 * scaleMode maps Pencil scale modes to Figma's FILL/FIT/TILE/CROP.
 */
export function applyImageFill(
  node: RectangleNode | FrameNode | EllipseNode,
  image: Image,
  scaleMode?: string,
  opacity?: number
): void {
  const figmaScale = toFigmaScaleMode(scaleMode)
  const fill: ImagePaint = {
    type: 'IMAGE',
    imageHash: image.hash,
    scaleMode: figmaScale,
    opacity: opacity ?? 1,
  }
  node.fills = [...(node.fills as Paint[]), fill]
}

function toFigmaScaleMode(
  pencilMode?: string
): 'FILL' | 'FIT' | 'TILE' | 'CROP' {
  switch (pencilMode) {
    case 'fit':   return 'FIT'
    case 'tile':  return 'TILE'
    case 'crop':  return 'CROP'
    default:      return 'FILL'
  }
}
