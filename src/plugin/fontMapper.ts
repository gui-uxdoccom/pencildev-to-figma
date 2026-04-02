import { FontWarning, RequiredFont, FontMappingMap } from '../../shared/types'

// Fallback font used whenever a font cannot be loaded
const FALLBACK_FAMILY = 'Inter'

// User-provided font mappings (set before import via setFontMappings)
let userFontMappings: FontMappingMap = {}

/**
 * Sets user-chosen font mappings. Called before import starts.
 * Key format: "family::style" → { family, style }
 */
export function setFontMappings(mappings: FontMappingMap): void {
  userFontMappings = mappings
}

/**
 * Maps a CSS font-weight number to candidate Figma style name strings.
 * We try each candidate in order until one loads successfully.
 */
const WEIGHT_STYLES: Record<number, string[]> = {
  100: ['Thin', 'Extra Light', 'ExtraLight'],
  200: ['Extra Light', 'ExtraLight', 'Ultra Light', 'Light'],
  300: ['Light', 'Semilight'],
  400: ['Regular', 'Normal', 'Book'],
  500: ['Medium'],
  600: ['SemiBold', 'Semi Bold', 'Demi Bold', 'DemiBold', 'Bold'],
  700: ['Bold'],
  800: ['Extra Bold', 'ExtraBold', 'Ultra Bold', 'Heavy'],
  900: ['Black', 'Heavy', 'Ultra Black'],
}

/**
 * Returns candidate Figma style strings for a given Pencil font definition.
 */
export function resolveFontStyle(weight?: number, isItalic?: boolean): string[] {
  const w = roundWeight(weight ?? 400)
  const baseStyles = WEIGHT_STYLES[w] ?? ['Regular']
  if (!isItalic) return baseStyles

  // For italic, try "<Style> Italic" first, then plain italic fallback
  const italicStyles: string[] = []
  for (const s of baseStyles) {
    italicStyles.push(s === 'Regular' ? 'Italic' : `${s} Italic`)
  }
  italicStyles.push('Italic')
  return italicStyles
}

function roundWeight(w: number): number {
  const valid = [100, 200, 300, 400, 500, 600, 700, 800, 900]
  return valid.reduce((prev, curr) =>
    Math.abs(curr - w) < Math.abs(prev - w) ? curr : prev
  )
}

// Cache of already-attempted loads to avoid redundant async calls
const loadCache = new Map<string, FontName | null>()

function cacheKey(family: string, style: string) {
  return `${family}::${style}`
}

/**
 * Attempts to load a font by trying each candidate style in order.
 * Returns the FontName that successfully loaded, or null on failure.
 */
async function tryLoadFont(family: string, styles: string[]): Promise<FontName | null> {
  // Filter out styles already known to fail, collect uncached ones
  const uncached = styles.filter(s => !loadCache.has(cacheKey(family, s)))

  // Batch-load all uncached candidates simultaneously (avoids sequential event-loop round trips)
  await Promise.all(
    uncached.map(async style => {
      const key = cacheKey(family, style)
      try {
        await figma.loadFontAsync({ family, style })
        loadCache.set(key, { family, style })
      } catch {
        loadCache.set(key, null)
      }
    })
  )

  // Return the first style that loaded successfully, in priority order
  for (const style of styles) {
    const cached = loadCache.get(cacheKey(family, style))
    if (cached) return cached
  }
  return null
}

// Cached available fonts list (populated lazily)
let availableFontsCache: Font[] | null = null

async function getAvailableFonts(): Promise<Font[]> {
  if (!availableFontsCache) {
    availableFontsCache = await figma.listAvailableFontsAsync()
  }
  return availableFontsCache
}

/**
 * Try to find a close font family match from available fonts.
 * Checks for partial name matches (e.g., "Funnel Sans" → "Funnel Display").
 */
async function findSimilarFamily(family: string): Promise<string | null> {
  const fonts = await getAvailableFonts()
  const lowerFamily = family.toLowerCase()

  // Try exact match first (case-insensitive)
  const exact = fonts.find(f => f.fontName.family.toLowerCase() === lowerFamily)
  if (exact) return exact.fontName.family

  // Try prefix match (e.g., "Funnel Sans" shares "Funnel" with "Funnel Display")
  const parts = lowerFamily.split(/\s+/)
  if (parts.length > 1) {
    const prefix = parts[0]
    const similar = fonts.find(f => {
      const ff = f.fontName.family.toLowerCase()
      return ff.startsWith(prefix) && ff !== lowerFamily
    })
    if (similar) return similar.fontName.family
  }

  return null
}

/**
 * Loads a font for a given Pencil text node.
 * Falls back through these steps:
 *   1. Try exact family + weight/style candidates
 *   2. Try similar family names from available fonts
 *   3. Fall back to Inter with the same weight (preserving boldness)
 *   4. Fall back to Inter Regular as last resort
 *
 * Returns the FontName actually loaded.
 */
export async function loadFont(
  family: string | undefined,
  weight: number | undefined,
  isItalic: boolean | undefined,
  warnings: FontWarning[]
): Promise<FontName> {
  const resolvedFamily = family || FALLBACK_FAMILY
  const styles = resolveFontStyle(weight, isItalic)
  const original: RequiredFont = { family: resolvedFamily, style: styles[0] }

  // 0. Check user-provided font mappings first
  const mappingKey = `${resolvedFamily}::${styles[0]}`
  const userMapping = userFontMappings[mappingKey]
  if (userMapping) {
    const mapped = await tryLoadFont(userMapping.family, [userMapping.style])
    if (mapped) {
      if (mapped.family !== resolvedFamily || mapped.style !== styles[0]) {
        warnings.push({ original, substituted: { family: mapped.family, style: mapped.style } })
      }
      return mapped
    }
  }

  // 1. Try exact family
  const loaded = await tryLoadFont(resolvedFamily, styles)
  if (loaded) return loaded

  // 2. Try similar family name from available fonts
  const similarFamily = await findSimilarFamily(resolvedFamily)
  if (similarFamily && similarFamily !== resolvedFamily) {
    const similarLoaded = await tryLoadFont(similarFamily, styles)
    if (similarLoaded) {
      warnings.push({ original, substituted: { family: similarFamily, style: similarLoaded.style } })
      return similarLoaded
    }
  }

  // 3. Fall back to Inter but preserve weight/style
  const fallbackStyles = resolveFontStyle(weight, isItalic)
  const fallbackWithWeight = await tryLoadFont(FALLBACK_FAMILY, fallbackStyles)
  if (fallbackWithWeight) {
    warnings.push({ original, substituted: { family: FALLBACK_FAMILY, style: fallbackWithWeight.style } })
    return fallbackWithWeight
  }

  // 4. Last resort: Inter Regular
  const fallback: FontName = { family: FALLBACK_FAMILY, style: 'Regular' }
  const fallbackKey = cacheKey(FALLBACK_FAMILY, 'Regular')
  if (!loadCache.has(fallbackKey)) {
    try {
      await figma.loadFontAsync(fallback)
      loadCache.set(fallbackKey, fallback)
    } catch {
      loadCache.set(fallbackKey, null)
    }
  }

  warnings.push({ original, substituted: { family: FALLBACK_FAMILY, style: 'Regular' } })
  return fallback
}

/**
 * Pre-loads the fallback font at plugin startup to guarantee it's available.
 */
export async function preloadFallback(): Promise<void> {
  try {
    await figma.loadFontAsync({ family: FALLBACK_FAMILY, style: 'Regular' })
    loadCache.set(cacheKey(FALLBACK_FAMILY, 'Regular'), { family: FALLBACK_FAMILY, style: 'Regular' })
  } catch {
    // If even Inter Regular fails, we can't do much
  }
}
