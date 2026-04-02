import {
  PencilNode,
  PencilFrame,
  PencilText,
  PencilEllipse,
  PencilIconFont,
  PencilRef,
  PencilFill,
  PencilGradientFill,
  PencilEffect,
  PencilShadowEffect,
  PencilStroke,
  ImageMap,
  FontWarning,
  ImageWarning,
} from '../../shared/types'
import { ComponentRegistry } from './componentRegistry'
import { loadFont } from './fontMapper'
import { createFigmaImage } from './imageHandler'

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────

interface RGBA { r: number; g: number; b: number; a: number }

function parseColor(color: string): RGBA {
  if (!color) return { r: 0, g: 0, b: 0, a: 1 }

  // #RRGGBBAA (8-digit with alpha)
  const hex8 = color.match(/^#([0-9a-f]{8})$/i)
  if (hex8) {
    const n = parseInt(hex8[1], 16)
    return {
      r: ((n >> 24) & 0xff) / 255,
      g: ((n >> 16) & 0xff) / 255,
      b: ((n >> 8)  & 0xff) / 255,
      a:  (n        & 0xff) / 255,
    }
  }

  // #RRGGBB
  const hex6 = color.match(/^#([0-9a-f]{6})$/i)
  if (hex6) {
    const n = parseInt(hex6[1], 16)
    return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255, a: 1 }
  }

  // #RGB
  const hex3 = color.match(/^#([0-9a-f]{3})$/i)
  if (hex3) {
    const r = parseInt(hex3[1][0].repeat(2), 16) / 255
    const g = parseInt(hex3[1][1].repeat(2), 16) / 255
    const b = parseInt(hex3[1][2].repeat(2), 16) / 255
    return { r, g, b, a: 1 }
  }

  // rgba(r, g, b, a) / rgb(r, g, b)
  const rgba = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/)
  if (rgba) {
    return {
      r: parseInt(rgba[1]) / 255,
      g: parseInt(rgba[2]) / 255,
      b: parseInt(rgba[3]) / 255,
      a: rgba[4] !== undefined ? parseFloat(rgba[4]) : 1,
    }
  }

  return { r: 0, g: 0, b: 0, a: 1 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sizing helpers — parse "fill_container", "fit_content", "fill_container(100)"
// ─────────────────────────────────────────────────────────────────────────────

type SizingMode = 'fixed' | 'fill' | 'hug' | 'none'

function parseSizing(value: number | string | undefined): { mode: SizingMode; fallback?: number } {
  if (value === undefined) return { mode: 'none' }
  if (typeof value === 'number') return { mode: 'fixed', fallback: value }

  if (value === 'fill_container') return { mode: 'fill' }
  if (value === 'fit_content') return { mode: 'hug' }

  const fillMatch = value.match(/^fill_container\((\d+)\)$/)
  if (fillMatch) return { mode: 'fill', fallback: parseInt(fillMatch[1]) }

  const fitMatch = value.match(/^fit_content\((\d+)\)$/)
  if (fitMatch) return { mode: 'hug', fallback: parseInt(fitMatch[1]) }

  return { mode: 'none' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Font weight helper  ("bold" | "normal" | "500" → number)
// ─────────────────────────────────────────────────────────────────────────────

function parseFontWeight(fw: string | number | undefined): number {
  if (fw === undefined) return 400
  if (typeof fw === 'number') return fw
  switch (fw.toLowerCase()) {
    case 'thin':       return 100
    case 'extralight':
    case 'extra-light': return 200
    case 'light':      return 300
    case 'normal':
    case 'regular':    return 400
    case 'medium':     return 500
    case 'semibold':
    case 'semi-bold':  return 600
    case 'bold':       return 700
    case 'extrabold':
    case 'extra-bold': return 800
    case 'black':
    case 'heavy':      return 900
    default: {
      const n = parseInt(fw, 10)
      return isNaN(n) ? 400 : n
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fill conversion
// ─────────────────────────────────────────────────────────────────────────────

async function parseFill(
  fill: PencilFill | PencilFill[] | undefined,
  imageMap: ImageMap,
  imageWarnings: ImageWarning[]
): Promise<Paint[]> {
  if (!fill) return []

  // Handle fill arrays — pen format supports Fill | Fill[]
  if (Array.isArray(fill)) {
    const paints: Paint[] = []
    for (const f of fill) {
      paints.push(...await parseSingleFill(f, imageMap, imageWarnings))
    }
    return paints
  }

  return parseSingleFill(fill, imageMap, imageWarnings)
}

async function parseSingleFill(
  fill: PencilFill,
  imageMap: ImageMap,
  imageWarnings: ImageWarning[]
): Promise<Paint[]> {
  if (!fill) return []

  // ── Solid color string ────────────────────────────────────────────────────
  if (typeof fill === 'string') {
    const { r, g, b, a } = parseColor(fill)
    return [{ type: 'SOLID', color: { r, g, b }, opacity: a } as SolidPaint]
  }

  // ── Image fill ────────────────────────────────────────────────────────────
  if (fill.type === 'image') {
    if (fill.enabled === false) return []
    const url = fill.url ?? ''
    if (!url) return []
    const image = await createFigmaImage(url, imageMap, imageWarnings)
    if (!image) {
      return [{ type: 'SOLID', color: { r: 0.78, g: 0.78, b: 0.78 }, opacity: 1 } as SolidPaint]
    }
    const modeMap: Record<string, 'FILL' | 'FIT' | 'TILE' | 'CROP'> = {
      fill: 'FILL', fit: 'FIT', tile: 'TILE', crop: 'CROP',
    }
    const paint: ImagePaint = {
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: modeMap[fill.mode ?? 'fill'] ?? 'FILL',
    }
    return [paint]
  }

  // ── Gradient fill ─────────────────────────────────────────────────────────
  if (fill.type === 'gradient') {
    if (fill.enabled === false) return []
    const g = fill as PencilGradientFill
    const stops: ColorStop[] = g.colors.map(c => {
      const { r, g: gr, b, a } = parseColor(c.color)
      return { position: c.position, color: { r, g: gr, b, a } }
    })

    if (g.gradientType === 'linear') {
      const angle = (90 - (g.rotation ?? 90)) * (Math.PI / 180)
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const paint: GradientPaint = {
        type: 'GRADIENT_LINEAR',
        gradientTransform: [
          [cos, sin, 0.5 - 0.5 * cos - 0.5 * sin],
          [-sin, cos, 0.5 + 0.5 * sin - 0.5 * cos],
        ],
        gradientStops: stops,
      }
      return [paint]
    }

    if (g.gradientType === 'radial') {
      const paint: GradientPaint = {
        type: 'GRADIENT_RADIAL',
        gradientTransform: [[0.5, 0, 0.5], [0, 0.5, 0.5]],
        gradientStops: stops,
      }
      return [paint]
    }

    if (g.gradientType === 'angular') {
      const paint: GradientPaint = {
        type: 'GRADIENT_ANGULAR',
        gradientTransform: [[1, 0, 0.5], [0, 1, 0.5]],
        gradientStops: stops,
      }
      return [paint]
    }
  }

  return []
}

// ─────────────────────────────────────────────────────────────────────────────
// Stroke conversion — handles BOTH old format { color, width, position } and
// actual pen format { align, thickness, fill }
// ─────────────────────────────────────────────────────────────────────────────

async function applyStroke(node: GeometryMixin & BaseNode, stroke: PencilStroke | undefined, imageMap: ImageMap, imageWarnings: ImageWarning[]): Promise<void> {
  if (!stroke) return

  // Resolve stroke color — pen format uses `fill`, old format uses `color`
  const strokeColor = (stroke as any).fill ?? stroke.color
  if (strokeColor) {
    const paints = await parseFill(strokeColor, imageMap, imageWarnings)
    if (paints.length > 0) {
      node.strokes = paints
    }
  }

  // Resolve stroke weight — pen format uses `thickness`, old format uses `width`
  const thickness = (stroke as any).thickness ?? stroke.width
  if (thickness !== undefined) {
    if (typeof thickness === 'number') {
      ;(node as any).strokeWeight = thickness
    } else if (typeof thickness === 'object') {
      // Per-side stroke: { top, right, bottom, left }
      ;(node as any).strokeTopWeight    = thickness.top ?? 0
      ;(node as any).strokeRightWeight  = thickness.right ?? 0
      ;(node as any).strokeBottomWeight = thickness.bottom ?? 0
      ;(node as any).strokeLeftWeight   = thickness.left ?? 0
    }
  }

  // Stroke alignment — pen uses `align`, old format uses `position`
  const position = (stroke as any).align ?? stroke.position
  if (position) {
    const posMap: Record<string, 'INSIDE' | 'OUTSIDE' | 'CENTER'> = {
      inside: 'INSIDE', outside: 'OUTSIDE', center: 'CENTER',
    }
    ;(node as any).strokeAlign = posMap[position] ?? 'INSIDE'
  }

  // Dash pattern
  const dashPattern = (stroke as any).dashPattern ?? stroke.dashArray
  if (dashPattern && dashPattern.length > 0) {
    ;(node as any).dashPattern = dashPattern
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Effects conversion — handles BOTH old format and actual pen format
// ─────────────────────────────────────────────────────────────────────────────

function convertEffects(effects: PencilEffect | PencilEffect[] | undefined): Effect[] {
  if (!effects) return []

  // Pen format uses singular `effect` which can be a single object or array
  const arr = Array.isArray(effects) ? effects : [effects]

  return arr.map(e => {
    // Shadow — pen format: { type: "shadow", shadowType: "inner"|"outer", offset, blur, spread, color }
    // Old format: { type: "shadow"|"inner-shadow", x, y, blur, spread, color }
    if (e.type === 'shadow' || e.type === 'inner-shadow') {
      const s = e as any
      const isInner = s.shadowType === 'inner' || s.type === 'inner-shadow'
      const color = s.color ? parseColor(s.color) : { r: 0, g: 0, b: 0, a: 0.25 }
      const offsetX = s.offset?.x ?? s.x ?? 0
      const offsetY = s.offset?.y ?? s.y ?? 0
      return {
        type: isInner ? 'INNER_SHADOW' : 'DROP_SHADOW',
        color: { r: color.r, g: color.g, b: color.b, a: s.opacity ?? color.a },
        offset: { x: offsetX, y: offsetY },
        radius: s.blur ?? 0,
        spread: s.spread ?? 0,
        visible: s.enabled !== false,
        blendMode: 'NORMAL',
      } as DropShadowEffect | InnerShadowEffect
    }
    if (e.type === 'blur') {
      return { type: 'LAYER_BLUR', radius: (e as any).radius ?? 0, visible: true } as BlurEffect
    }
    if (e.type === 'background_blur' || e.type === 'background-blur') {
      return { type: 'BACKGROUND_BLUR', radius: (e as any).radius ?? 0, visible: true } as BlurEffect
    }
    return null
  }).filter(Boolean) as Effect[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Corner radius
// ─────────────────────────────────────────────────────────────────────────────

function applyCornerRadius(
  node: RectangleNode | FrameNode | ComponentNode | InstanceNode,
  radius: number | string | (number | string)[] | undefined
): void {
  if (radius === undefined) return
  if (typeof radius === 'number') {
    node.cornerRadius = radius
  } else if (typeof radius === 'string') {
    // Unresolved variable reference — skip gracefully
    return
  } else if (Array.isArray(radius)) {
    const nums = radius.map(v => typeof v === 'number' ? v : 0)
    node.topLeftRadius     = nums[0]
    node.topRightRadius    = nums[1]
    node.bottomRightRadius = nums[2]
    node.bottomLeftRadius  = nums[3]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-layout from Pencil flexbox
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise justifyContent/alignItems values — handle underscores, hyphens, and bare values */
function normaliseFlexValue(v: string): string {
  return v.replace(/_/g, '-')
}

function applyAutoLayout(frame: FrameNode | ComponentNode, pencil: PencilFrame): void {
  const hasFlexProps =
    pencil.gap !== undefined ||
    pencil.justifyContent !== undefined ||
    pencil.alignItems !== undefined ||
    (pencil.padding !== undefined && (pencil.children?.length ?? 0) > 0)

  const effectiveLayout: 'horizontal' | 'vertical' | 'none' =
    pencil.layout === 'none'   ? 'none'       :
    pencil.layout === 'vertical' ? 'vertical'  :
    pencil.layout === 'horizontal' ? 'horizontal' :
    hasFlexProps               ? 'horizontal' :
    'none'

  if (effectiveLayout === 'none') return

  const isVertical = effectiveLayout === 'vertical'
  frame.layoutMode = isVertical ? 'VERTICAL' : 'HORIZONTAL'
  frame.itemSpacing = typeof pencil.gap === 'number' ? pencil.gap : 0
  frame.layoutWrap = pencil.wrap ? 'WRAP' : 'NO_WRAP'

  // Padding — supports: number | [v, h] | [t, r, b, l]
  if (pencil.padding !== undefined) {
    const p = pencil.padding
    if (typeof p === 'number') {
      frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = p
    } else if (p.length === 2) {
      const [v, h] = p
      frame.paddingTop = frame.paddingBottom = v
      frame.paddingLeft = frame.paddingRight = h
    } else if (p.length === 4) {
      const [t, r, b, l] = p
      frame.paddingTop    = t
      frame.paddingRight  = r
      frame.paddingBottom = b
      frame.paddingLeft   = l
    }
  }

  // Primary axis (justifyContent) — handle both "flex-start"/"start" and underscore variants
  const justifyMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'> = {
    'start':         'MIN',
    'flex-start':    'MIN',
    'end':           'MAX',
    'flex-end':      'MAX',
    'center':        'CENTER',
    'space-between': 'SPACE_BETWEEN',
    'space-around':  'SPACE_BETWEEN',
  }
  const jcNorm = normaliseFlexValue(pencil.justifyContent ?? 'start')
  frame.primaryAxisAlignItems = justifyMap[jcNorm] ?? 'MIN'

  // Counter axis (alignItems)
  const alignMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'> = {
    'start':      'MIN',
    'flex-start': 'MIN',
    'end':        'MAX',
    'flex-end':   'MAX',
    'center':     'CENTER',
    'stretch':    'MIN',
  }
  const aiNorm = normaliseFlexValue(pencil.alignItems ?? 'start')
  frame.counterAxisAlignItems = alignMap[aiNorm] ?? 'MIN'

  // ── Sizing: use modern layoutSizingHorizontal/layoutSizingVertical ────────
  // Set HUG for axes that aren't fixed or fill. FILL is set later after appendChild.
  const wSizing = parseSizing(pencil.width)
  const hSizing = parseSizing(pencil.height)

  // When Figma sets layoutMode, it defaults both axes to HUG.
  // We must explicitly set FIXED for axes with fixed dimensions,
  // otherwise the frame collapses and features like justifyContent centering break.
  if (isVertical) {
    // Primary axis = vertical
    if (hSizing.mode === 'fixed') {
      frame.layoutSizingVertical = 'FIXED'
    } else {
      frame.layoutSizingVertical = 'HUG'
    }
    // Counter axis = horizontal
    if (wSizing.mode === 'fixed') {
      frame.layoutSizingHorizontal = 'FIXED'
    } else if (wSizing.mode !== 'fill') {
      frame.layoutSizingHorizontal = 'HUG'
    }
  } else {
    // Primary axis = horizontal
    if (wSizing.mode === 'fixed') {
      frame.layoutSizingHorizontal = 'FIXED'
    } else {
      frame.layoutSizingHorizontal = 'HUG'
    }
    // Counter axis = vertical
    if (hSizing.mode === 'fixed') {
      frame.layoutSizingVertical = 'FIXED'
    } else if (hSizing.mode !== 'fill') {
      frame.layoutSizingVertical = 'HUG'
    }
  }

  // Min/max sizing constraints
  if (pencil.minWidth  !== undefined) frame.minWidth  = pencil.minWidth
  if (pencil.maxWidth  !== undefined) frame.maxWidth  = pencil.maxWidth
  if (pencil.minHeight !== undefined) frame.minHeight = pencil.minHeight
  if (pencil.maxHeight !== undefined) frame.maxHeight = pencil.maxHeight
}

/**
 * Sets child sizing and positioning within an auto-layout parent.
 * Uses modern layoutSizingHorizontal/layoutSizingVertical API.
 * MUST be called AFTER the node has been appended to its parent.
 */
function applyLayoutChildProps(
  figmaNode: SceneNode,
  pencil: PencilNode,
  parent: FrameNode | ComponentNode | GroupNode | PageNode
): void {
  if (!('layoutSizingHorizontal' in figmaNode)) return
  if (!('layoutMode' in parent)) return

  const parentLayout = (parent as FrameNode).layoutMode
  if (!parentLayout || parentLayout === 'NONE') return

  const node = figmaNode as any

  // Handle fill_container → FILL
  const wSizing = parseSizing(pencil.width)
  const hSizing = parseSizing(pencil.height)

  if (wSizing.mode === 'fill') {
    node.layoutSizingHorizontal = 'FILL'
  }
  if (hSizing.mode === 'fill') {
    node.layoutSizingVertical = 'FILL'
  }

  // Handle layoutPosition: absolute — for overlays and absolutely positioned children
  if ((pencil as any).layoutPosition === 'absolute') {
    node.layoutPositioning = 'ABSOLUTE'
  }

  // Min/max sizing constraints on children
  if (pencil.minWidth  !== undefined) node.minWidth  = pencil.minWidth
  if (pencil.maxWidth  !== undefined) node.maxWidth  = pencil.maxWidth
  if (pencil.minHeight !== undefined) node.minHeight = pencil.minHeight
  if (pencil.maxHeight !== undefined) node.maxHeight = pencil.maxHeight
}

// ─────────────────────────────────────────────────────────────────────────────
// Base node properties (position, size, visibility, opacity)
// ─────────────────────────────────────────────────────────────────────────────

function applyBase(figmaNode: SceneNode, pencil: PencilNode): void {
  figmaNode.name = pencil.name || pencil.type

  if ('x' in figmaNode && pencil.x !== undefined) figmaNode.x = pencil.x
  if ('y' in figmaNode && pencil.y !== undefined) figmaNode.y = pencil.y

  // Parse sizing — use explicit number or fallback from sizing behavior
  const wSizing = parseSizing(pencil.width)
  const hSizing = parseSizing(pencil.height)
  const w = wSizing.mode === 'fixed' ? wSizing.fallback
          : wSizing.fallback          ? wSizing.fallback  // fit_content(N) / fill_container(N) fallback
          : undefined
  const h = hSizing.mode === 'fixed' ? hSizing.fallback
          : hSizing.fallback          ? hSizing.fallback
          : undefined

  if ('resize' in figmaNode) {
    const fw = w && w > 0 ? w : undefined
    const fh = h && h > 0 ? h : undefined
    if (fw !== undefined && fh !== undefined) {
      figmaNode.resize(fw, fh)
    } else if (fw !== undefined) {
      figmaNode.resize(fw, Math.max((figmaNode as any).height ?? 1, 1))
    } else if (fh !== undefined) {
      figmaNode.resize(Math.max((figmaNode as any).width ?? 1, 1), fh)
    }
  }

  if ('visible' in figmaNode && pencil.visible === false) {
    figmaNode.visible = false
  }

  if ('opacity' in figmaNode && pencil.opacity !== undefined) {
    figmaNode.opacity = Math.max(0, Math.min(1, pencil.opacity))
  }

  if ('rotation' in figmaNode && pencil.rotation) {
    figmaNode.rotation = -pencil.rotation
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main transformer
// ─────────────────────────────────────────────────────────────────────────────

export interface TransformContext {
  imageMap: ImageMap
  registry: ComponentRegistry
  fontWarnings: FontWarning[]
  imageWarnings: ImageWarning[]
  progress?: (msg: string) => void
}

/**
 * Transforms a single Pencil node (and its children) into a Figma SceneNode.
 * Appends the result to `parent`.
 */
export async function transformNode(
  pencil: PencilNode,
  parent: FrameNode | ComponentNode | GroupNode | PageNode,
  ctx: TransformContext
): Promise<SceneNode | null> {

  let figmaNode: SceneNode | null = null

  switch (pencil.type) {

    // ── Frame ──────────────────────────────────────────────────────────────
    case 'frame': {
      const frame = figma.createFrame()
      applyBase(frame, pencil)
      frame.clipsContent = pencil.clip ?? false
      applyCornerRadius(frame, pencil.cornerRadius)
      applyAutoLayout(frame, pencil as PencilFrame)
      frame.fills = await parseFill(pencil.fill, ctx.imageMap, ctx.imageWarnings)
      await applyStroke(frame, pencil.stroke, ctx.imageMap, ctx.imageWarnings)
      frame.effects = convertEffects((pencil as any).effect ?? pencil.effects)
      parent.appendChild(frame)
      applyLayoutChildProps(frame, pencil, parent)

      if (pencil.children) {
        for (const child of pencil.children) {
          await transformNode(child, frame, ctx)
        }
      }
      figmaNode = frame
      break
    }

    // ── Group ──────────────────────────────────────────────────────────────
    case 'group': {
      const childNodes: SceneNode[] = []
      const tempFrame = figma.createFrame()
      tempFrame.name = '__temp__'
      parent.appendChild(tempFrame)

      if (pencil.children) {
        for (const child of pencil.children) {
          const n = await transformNode(child, tempFrame, ctx)
          if (n) childNodes.push(n)
        }
      }

      if (childNodes.length === 0) {
        applyBase(tempFrame, pencil)
        tempFrame.fills = []
        figmaNode = tempFrame
      } else {
        for (const n of childNodes) parent.appendChild(n)
        tempFrame.remove()
        const group = figma.group(childNodes, parent)
        group.name = pencil.name || 'Group'
        if (pencil.opacity !== undefined) group.opacity = pencil.opacity
        if (pencil.visible === false) group.visible = false
        figmaNode = group
      }
      break
    }

    // ── Rectangle ──────────────────────────────────────────────────────────
    case 'rectangle': {
      const rect = figma.createRectangle()
      applyBase(rect, pencil)
      applyCornerRadius(rect, pencil.cornerRadius)
      rect.fills = await parseFill(pencil.fill, ctx.imageMap, ctx.imageWarnings)
      await applyStroke(rect, pencil.stroke, ctx.imageMap, ctx.imageWarnings)
      rect.effects = convertEffects((pencil as any).effect ?? pencil.effects)
      parent.appendChild(rect)
      applyLayoutChildProps(rect, pencil, parent)
      figmaNode = rect
      break
    }

    // ── Ellipse ─────────────────────────────────────────────────────────────
    case 'ellipse': {
      const ellipse = figma.createEllipse()
      applyBase(ellipse, pencil)
      ellipse.fills = await parseFill(pencil.fill, ctx.imageMap, ctx.imageWarnings)
      await applyStroke(ellipse, pencil.stroke, ctx.imageMap, ctx.imageWarnings)
      ellipse.effects = convertEffects((pencil as any).effect ?? pencil.effects)
      const pe = pencil as PencilEllipse
      if (pe.arcStart !== undefined || pe.arcEnd !== undefined) {
        ellipse.arcData = {
          startingAngle: (pe.arcStart ?? 0) * (Math.PI / 180),
          endingAngle: (pe.arcEnd ?? 360) * (Math.PI / 180),
          innerRadius: 0,
        }
      }
      parent.appendChild(ellipse)
      applyLayoutChildProps(ellipse, pencil, parent)
      figmaNode = ellipse
      break
    }

    // ── Line ────────────────────────────────────────────────────────────────
    case 'line': {
      const line = figma.createLine()
      applyBase(line, pencil)
      await applyStroke(line, pencil.stroke, ctx.imageMap, ctx.imageWarnings)
      parent.appendChild(line)
      applyLayoutChildProps(line, pencil, parent)
      figmaNode = line
      break
    }

    // ── Polygon ─────────────────────────────────────────────────────────────
    case 'polygon': {
      const poly = figma.createPolygon()
      applyBase(poly, pencil)
      if ((pencil as any).sides !== undefined) poly.pointCount = (pencil as any).sides
      poly.fills = await parseFill(pencil.fill, ctx.imageMap, ctx.imageWarnings)
      await applyStroke(poly, pencil.stroke, ctx.imageMap, ctx.imageWarnings)
      parent.appendChild(poly)
      figmaNode = poly
      break
    }

    // ── Path / Vector ────────────────────────────────────────────────────────
    case 'path': {
      const vector = figma.createVector()
      applyBase(vector, pencil)
      const path = pencil as any
      if (path.d && typeof path.d === 'string') {
        vector.vectorPaths = [{
          windingRule: path.windingRule === 'evenodd' ? 'EVENODD' : 'NONZERO',
          data: path.d,
        }]
      }
      vector.fills = await parseFill(pencil.fill, ctx.imageMap, ctx.imageWarnings)
      await applyStroke(vector, pencil.stroke, ctx.imageMap, ctx.imageWarnings)
      vector.effects = convertEffects((pencil as any).effect ?? pencil.effects)
      parent.appendChild(vector)
      figmaNode = vector
      break
    }

    // ── Text / Note / Context / Prompt ───────────────────────────────────────
    case 'text':
    case 'note':
    case 'context':
    case 'prompt': {
      const p = pencil as PencilText
      const weight = parseFontWeight(p.fontWeight)
      const isItalic = p.fontStyle === 'italic'
      const font = await loadFont(p.fontFamily, weight, isItalic, ctx.fontWarnings)

      const text = figma.createText()
      applyBase(text, pencil)
      text.fontName = font
      text.characters = p.content ?? ''

      if (p.fontSize !== undefined)     text.fontSize = p.fontSize
      if (p.letterSpacing !== undefined) {
        text.letterSpacing = { unit: 'PIXELS', value: p.letterSpacing }
      }
      // lineHeight is a multiplier (e.g. 1.5) → PERCENT in Figma
      if (p.lineHeight !== undefined) {
        text.lineHeight = { unit: 'PERCENT', value: p.lineHeight * 100 }
      }
      if (p.textAlign) {
        const alignMap: Record<string, 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'> = {
          left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFIED',
        }
        text.textAlignHorizontal = alignMap[p.textAlign] ?? 'LEFT'
      }
      if (p.textAlignVertical) {
        const vAlignMap: Record<string, 'TOP' | 'CENTER' | 'BOTTOM'> = {
          top: 'TOP', middle: 'CENTER', bottom: 'BOTTOM',
        }
        text.textAlignVertical = vAlignMap[p.textAlignVertical] ?? 'TOP'
      }
      if (p.textDecoration === 'underline')    text.textDecoration = 'UNDERLINE'
      if (p.textDecoration === 'line-through') text.textDecoration = 'STRIKETHROUGH'
      if (p.textTransform) {
        const caseMap: Record<string, 'UPPER' | 'LOWER' | 'TITLE' | 'ORIGINAL'> = {
          uppercase: 'UPPER', lowercase: 'LOWER', capitalize: 'TITLE', none: 'ORIGINAL',
        }
        text.textCase = caseMap[p.textTransform] ?? 'ORIGINAL'
      }

      // Resize behaviour
      const hasFixedWidth =
        p.textGrowth === 'fixed-width' || p.textGrowth === 'fixed' ||
        p.textGrowth === 'fixed-width-height'
      const hasFixedHeight = p.textGrowth === 'fixed-width-height'
      text.textAutoResize = hasFixedHeight ? 'NONE' : hasFixedWidth ? 'HEIGHT' : 'WIDTH_AND_HEIGHT'

      // Color: fill property
      const textFill = await parseFill(p.fill, ctx.imageMap, ctx.imageWarnings)
      if (textFill.length > 0) text.fills = textFill

      // Rich text segments
      if (p.segments && p.segments.length > 0) {
        let cursor = 0
        for (const seg of p.segments) {
          const segWeight = parseFontWeight(seg.fontWeight ?? p.fontWeight)
          const segFont = await loadFont(
            seg.fontFamily ?? p.fontFamily,
            segWeight,
            (seg.fontStyle ?? p.fontStyle) === 'italic',
            ctx.fontWarnings
          )
          const start = cursor
          const end = cursor + seg.content.length
          text.setRangeFontName(start, end, segFont)
          if (seg.fontSize)      text.setRangeFontSize(start, end, seg.fontSize)
          if (seg.letterSpacing) text.setRangeLetterSpacing(start, end, { unit: 'PIXELS', value: seg.letterSpacing })
          if (seg.fill) {
            const segFill = await parseFill(seg.fill, ctx.imageMap, ctx.imageWarnings)
            if (segFill.length > 0) text.setRangeFills(start, end, segFill)
          }
          if (seg.textDecoration === 'underline')    text.setRangeTextDecoration(start, end, 'UNDERLINE')
          if (seg.textDecoration === 'line-through') text.setRangeTextDecoration(start, end, 'STRIKETHROUGH')
          cursor = end
        }
      }

      parent.appendChild(text)
      applyLayoutChildProps(text, pencil, parent)
      figmaNode = text
      break
    }

    // ── Icon Font ────────────────────────────────────────────────────────────
    case 'icon_font': {
      const p = pencil as PencilIconFont
      const font = await loadFont(p.iconFontFamily, 400, false, ctx.fontWarnings)

      const text = figma.createText()
      applyBase(text, pencil)
      text.fontName = font
      text.characters = p.iconFontName ?? ''
      if (p.size !== undefined) text.fontSize = p.size

      const iconFill = await parseFill(p.fill, ctx.imageMap, ctx.imageWarnings)
      if (iconFill.length > 0) text.fills = iconFill

      parent.appendChild(text)
      figmaNode = text
      break
    }

    // ── Component Instance (ref) ─────────────────────────────────────────────
    case 'ref': {
      const p = pencil as PencilRef
      const component = ctx.registry.get(p.ref)

      if (component) {
        const instance = component.createInstance()
        applyBase(instance, pencil)
        parent.appendChild(instance)
        applyLayoutChildProps(instance, pencil, parent)
        figmaNode = instance
      } else {
        const placeholder = figma.createRectangle()
        applyBase(placeholder, pencil)
        placeholder.name = `[missing ref: ${p.ref}]`
        placeholder.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0.5 }, opacity: 0.2 }]
        placeholder.strokes = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0.5 } }]
        placeholder.strokeWeight = 1
        parent.appendChild(placeholder)
        figmaNode = placeholder
      }
      break
    }

    default:
      break
  }

  if (figmaNode) ctx.progress?.(`${pencil.name || pencil.type}`)

  return figmaNode
}

/**
 * Builds all ComponentNodes for every `reusable: true` node in the tree.
 */
export async function buildComponents(
  reusableNodes: PencilNode[],
  componentsPage: PageNode,
  ctx: TransformContext
): Promise<void> {
  const container = figma.createFrame()
  container.name = '⚙ Pencil Components'
  container.fills = []
  container.x = -99999
  container.y = -99999
  container.resize(1000, 1000)
  container.clipsContent = false
  componentsPage.appendChild(container)

  for (const pencilNode of reusableNodes) {
    const comp = figma.createComponent()
    comp.name = pencilNode.name || pencilNode.id

    const w = typeof pencilNode.width  === 'number' ? pencilNode.width  : undefined
    const h = typeof pencilNode.height === 'number' ? pencilNode.height : undefined
    if (w && h) comp.resize(w, h)

    comp.fills = await parseFill(pencilNode.fill, ctx.imageMap, ctx.imageWarnings)
    await applyStroke(comp as unknown as GeometryMixin & BaseNode, pencilNode.stroke, ctx.imageMap, ctx.imageWarnings)
    applyCornerRadius(comp, pencilNode.cornerRadius)
    comp.effects = convertEffects((pencilNode as any).effect ?? pencilNode.effects)
    if (pencilNode.type === 'frame') {
      applyAutoLayout(comp, pencilNode as PencilFrame)
      comp.clipsContent = (pencilNode as PencilFrame).clip ?? false
    }

    if (pencilNode.children) {
      for (const child of pencilNode.children) {
        await transformNode(child, comp, ctx)
      }
    }

    container.appendChild(comp)
    ctx.registry.register(pencilNode.id, comp)
  }
}
