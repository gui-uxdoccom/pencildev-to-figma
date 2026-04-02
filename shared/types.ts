// ─────────────────────────────────────────────────────────────────────────────
// Pencil .pen file format types  (v2.9 — based on real file analysis)
// ─────────────────────────────────────────────────────────────────────────────

export type PencilNodeType =
  | 'frame'
  | 'group'
  | 'rectangle'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'path'
  | 'text'
  | 'note'
  | 'context'
  | 'prompt'
  | 'ref'
  | 'icon_font'

// ── Fill value ────────────────────────────────────────────────────────────────
// `fill` is a single value, not an array. It can be:
//   - A color string:   "#FFFFFF" | "#1e1a90ff" | "#ffffffcc"
//   - An image object:  { type: "image", url: "...", mode: "fill" }
//   - A gradient object: { type: "gradient", gradientType: "linear"|"radial", ... }

export interface PencilImageFill {
  type: 'image'
  enabled?: boolean
  url?: string
  mode?: 'fill' | 'fit' | 'tile' | 'crop'
}

export interface PencilGradientStop {
  color: string
  position: number
}

export interface PencilGradientFill {
  type: 'gradient'
  gradientType: 'linear' | 'radial' | 'angular'
  enabled?: boolean
  rotation?: number
  colors: PencilGradientStop[]
  size?: { height?: number; width?: number }
}

export type PencilFillObject = PencilImageFill | PencilGradientFill

/** A fill is either a CSS color string or a structured fill object. */
export type PencilFill = string | PencilFillObject

// ── Stroke ────────────────────────────────────────────────────────────────────

export interface PencilStroke {
  // Old format
  color?: string
  width?: number
  opacity?: number
  position?: 'inside' | 'outside' | 'center'
  dashArray?: number[]
  // Actual pen format
  fill?: PencilFill
  thickness?: number | { top?: number; right?: number; bottom?: number; left?: number }
  align?: 'inside' | 'outside' | 'center'
  dashPattern?: number[]
}

// ── Effects ──────────────────────────────────────────────────────────────────

export interface PencilShadowEffect {
  type: 'shadow' | 'inner-shadow'
  shadowType?: 'inner' | 'outer'
  color?: string
  x?: number
  y?: number
  offset?: { x: number; y: number }
  blur?: number
  spread?: number
  opacity?: number
  enabled?: boolean
}

export interface PencilBlurEffect {
  type: 'blur' | 'background-blur' | 'background_blur'
  radius: number
  enabled?: boolean
}

export type PencilEffect = PencilShadowEffect | PencilBlurEffect

// ── Base Node ────────────────────────────────────────────────────────────────

export interface PencilBaseNode {
  id: string
  type: PencilNodeType
  name?: string
  x?: number
  y?: number
  /** numeric pixel size, "fill_container", "fit_content", or with fallback e.g. "fill_container(100)" */
  width?: number | string
  /** numeric pixel size, "fill_container", "fit_content", or with fallback e.g. "fit_content(600)" */
  height?: number | string
  visible?: boolean
  opacity?: number
  rotation?: number
  locked?: boolean
  fill?: PencilFill | PencilFill[]
  stroke?: PencilStroke
  effects?: PencilEffect[]
  /** Singular `effect` used in actual pen format */
  effect?: PencilEffect | PencilEffect[]
  reusable?: boolean
  /** Controls positioning within auto-layout parent */
  layoutPosition?: 'auto' | 'absolute'
  children?: PencilNode[]
  cornerRadius?: number | string | (number | string)[]
  clip?: boolean
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  alignSelf?: 'flex-start' | 'flex-end' | 'center' | 'stretch'
}

// ── Frame ────────────────────────────────────────────────────────────────────

export interface PencilFrame extends PencilBaseNode {
  type: 'frame'
  layout?: 'none' | 'horizontal' | 'vertical'
  gap?: number
  /**
   * Padding shorthand — mirrors CSS:
   *   number       → all four sides equal
   *   [v, h]       → [top+bottom, left+right]
   *   [t, r, b, l] → individual sides
   */
  padding?: number | [number, number] | [number, number, number, number]
  justifyContent?: 'start' | 'flex_start' | 'flex-start' | 'end' | 'flex_end' | 'flex-end'
    | 'center' | 'space_between' | 'space-between' | 'space_around' | 'space-around'
  alignItems?: 'start' | 'flex_start' | 'flex-start' | 'end' | 'flex_end' | 'flex-end' | 'center' | 'stretch'
  wrap?: boolean
  slot?: string
}

// ── Group ────────────────────────────────────────────────────────────────────

export interface PencilGroup extends PencilBaseNode {
  type: 'group'
}

// ── Shapes ───────────────────────────────────────────────────────────────────

export interface PencilRectangle extends PencilBaseNode {
  type: 'rectangle'
}

export interface PencilEllipse extends PencilBaseNode {
  type: 'ellipse'
  arcStart?: number
  arcEnd?: number
}

export interface PencilLine extends PencilBaseNode {
  type: 'line'
}

export interface PencilPolygon extends PencilBaseNode {
  type: 'polygon'
  sides?: number
}

export interface PencilPath extends PencilBaseNode {
  type: 'path'
  d?: string
  windingRule?: 'nonzero' | 'evenodd'
}

// ── Text ─────────────────────────────────────────────────────────────────────

export interface PencilText extends PencilBaseNode {
  type: 'text' | 'note' | 'context' | 'prompt'
  content?: string
  fontFamily?: string
  fontSize?: number
  /** String ("bold", "normal", "500", "700") or numeric weight */
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic'
  /** Multiplier (e.g. 1.5 = 150%) — NOT pixels */
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  textAlignVertical?: 'top' | 'middle' | 'bottom'
  textDecoration?: 'none' | 'underline' | 'line-through'
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  textGrowth?: 'auto' | 'fixed-width' | 'fixed-width-height' | 'fixed'
  segments?: PencilTextSegment[]
}

export interface PencilTextSegment {
  content: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic'
  fill?: PencilFill
  letterSpacing?: number
  textDecoration?: 'none' | 'underline' | 'line-through'
}

// ── Icon Font ─────────────────────────────────────────────────────────────────

export interface PencilIconFont extends PencilBaseNode {
  type: 'icon_font'
  iconFontName?: string
  iconFontFamily?: string
  size?: number
}

// ── Component Instance (ref) ─────────────────────────────────────────────────

export interface PencilRef extends PencilBaseNode {
  type: 'ref'
  ref: string
  descendants?: Record<string, Partial<PencilBaseNode>>
}

// ── Union ────────────────────────────────────────────────────────────────────

export type PencilNode =
  | PencilFrame
  | PencilGroup
  | PencilRectangle
  | PencilEllipse
  | PencilLine
  | PencilPolygon
  | PencilPath
  | PencilText
  | PencilIconFont
  | PencilRef

// ── Root .pen file ───────────────────────────────────────────────────────────

export interface PenVariable {
  type: 'color' | 'number' | 'boolean' | 'string'
  value: any
}

export interface PenFile {
  version?: string
  id?: string
  name?: string
  children?: PencilNode[]
  variables?: Record<string, PenVariable>
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin ↔ UI message types
// ─────────────────────────────────────────────────────────────────────────────

export type ImageMap = Record<string, string>

export interface RequiredFont {
  family: string
  style: string
}

/** A color stripe for building screen thumbnails */
export interface ThumbStripe {
  /** Relative height (0–1) of this section within the screen */
  ratio: number
  /** CSS color string */
  color: string
}

/** Result from loading a .pen file + its accompanying image files */
export interface PenFileLoadResult {
  fileName: string
  penFile: PenFile
  screens: PencilScreen[]
  versionWarning: boolean
  /** Images read from the local filesystem, keyed by relative path (e.g. "./images/foo.png") */
  localImageMap: ImageMap
  /** How many local image references the .pen file has */
  localImageRefsTotal: number
  /** How many of those were found on disk */
  localImageRefsFound: number
}

export interface PencilScreen {
  id: string
  name: string
  w: number
  h: number
  /** Background color of the screen */
  bgColor?: string
  /** Child section stripes for thumbnail rendering */
  stripes?: ThumbStripe[]
}

// ── Font mapping types ───────────────────────────────────────────────────────

/** A unique font requirement: family + weight + italic */
export interface FontRequirement {
  family: string
  weight: number
  isItalic: boolean
  /** The Figma style string resolved for this weight/italic combo */
  style: string
}

/** Result of scanning a single font requirement */
export interface FontScanEntry {
  required: FontRequirement
  available: boolean
  /** Suggested substitutions (family + style pairs) if not available */
  suggestions: RequiredFont[]
}

/** User-chosen mapping: key is "family::style", value is the chosen FontName */
export type FontMappingMap = Record<string, RequiredFont>

// ── UI → Plugin ───────────────────────────────────────────────────────────────

export interface ScanFontsMessage {
  type: 'SCAN_FONTS'
  tree: PenFile
  selectedScreenIds: string[]
}

export interface DesignPayloadMessage {
  type: 'DESIGN_PAYLOAD'
  fileName: string
  tree: PenFile
  selectedScreenIds: string[]
  imageMap: ImageMap
  fontMappings?: FontMappingMap
}

export interface CancelMessage {
  type: 'CANCEL'
}

export type UIToPluginMessage = DesignPayloadMessage | CancelMessage | ScanFontsMessage

// ── Plugin → UI ───────────────────────────────────────────────────────────────

export interface ReadyMessage {
  type: 'READY'
}

export interface ProgressMessage {
  type: 'PROGRESS'
  step: string
  current: number
  total: number
  /** High-level phase so the UI can show appropriate context */
  phase?: 'images' | 'components' | 'screens' | 'layout'
}

export interface FontWarning {
  original: RequiredFont
  substituted: RequiredFont
}

export interface ImageWarning {
  url: string
  reason: string
}

export interface DoneMessage {
  type: 'DONE'
  screensImported: number
  fontWarnings: FontWarning[]
  imageWarnings: ImageWarning[]
}

export interface ErrorMessage {
  type: 'ERROR'
  message: string
}

export interface LogMessage {
  type: 'LOG'
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface FontScanResultMessage {
  type: 'FONT_SCAN_RESULT'
  entries: FontScanEntry[]
}

export type PluginToUIMessage =
  | ReadyMessage
  | ProgressMessage
  | DoneMessage
  | ErrorMessage
  | LogMessage
  | FontScanResultMessage
