import { UIToPluginMessage, PluginToUIMessage, PencilNode, LogMessage, FontScanEntry, FontRequirement, RequiredFont } from '../../shared/types'
import { collectReusableNodes, ComponentRegistry } from './componentRegistry'
import { transformNode, buildComponents, TransformContext } from './transformer'
import { preloadFallback, setFontMappings, resolveFontStyle } from './fontMapper'
import { resolveVariables } from './variableResolver'

// ─────────────────────────────────────────────────────────────────────────────
// Plugin entry point
// ─────────────────────────────────────────────────────────────────────────────

figma.showUI(__html__, {
  width: 420,
  height: 560,
  title: 'Pencil to Figma',
})

// Tell the UI the plugin sandbox is ready
send({ type: 'READY' })

figma.ui.onmessage = async (msg: UIToPluginMessage) => {
  if (msg.type === 'CANCEL') {
    figma.closePlugin()
    return
  }

  if (msg.type === 'SCAN_FONTS') {
    try {
      await runFontScan(msg)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      send({ type: 'ERROR', message })
    }
    return
  }

  if (msg.type === 'DESIGN_PAYLOAD') {
    try {
      // Apply user-selected font mappings before importing
      if (msg.fontMappings) {
        setFontMappings(msg.fontMappings)
      }
      await runImport(msg)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      figma.notify(`Pencil to Figma: ${message}`, { error: true })
      send({ type: 'ERROR', message })
    }
    return
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Import orchestration
// ─────────────────────────────────────────────────────────────────────────────

async function runImport(msg: Extract<UIToPluginMessage, { type: 'DESIGN_PAYLOAD' }>) {
  const { fileName, selectedScreenIds, imageMap } = msg

  // Resolve "$varName" references throughout the tree before any processing
  const tree = resolveVariables(msg.tree)

  // Resolve the screen nodes selected by the user
  const allScreens = tree.children ?? []
  const selectedScreens = allScreens.filter(n => selectedScreenIds.includes(n.id))

  if (selectedScreens.length === 0) {
    send({ type: 'ERROR', message: 'No screens found matching the selection.' })
    return
  }

  // ── 1. Ensure fallback font is available ──────────────────────────────────
  await preloadFallback()

  const registry = new ComponentRegistry()
  const fontWarnings: Parameters<TransformContext['fontWarnings']['push']>[0][] = []
  const imageWarnings: Parameters<TransformContext['imageWarnings']['push']>[0][] = []

  const ctx: TransformContext = {
    imageMap,
    registry,
    fontWarnings,
    imageWarnings,
    progress: (msg) => log('info', msg),
  }

  // ── 2. Build components (only if the file contains reusable nodes) ─────────
  const reusableNodes = collectReusableNodes(tree)

  if (reusableNodes.length > 0) {
    send({ type: 'PROGRESS', step: 'Creating components', current: 0, total: reusableNodes.length, phase: 'components' })

    let componentsPage = figma.root.children.find(p => p.name === '⚙ Pencil Components') as PageNode | undefined
    if (!componentsPage) {
      componentsPage = figma.createPage()
      componentsPage.name = '⚙ Pencil Components'
    }
    await componentsPage.loadAsync()

    await buildComponents(reusableNodes, componentsPage, ctx)
    send({ type: 'PROGRESS', step: 'Creating components', current: reusableNodes.length, total: reusableNodes.length, phase: 'components' })
  }

  // ── 3. Create (or reuse) a design page named after the file ───────────────
  const pageName = stripExtension(fileName)
  let designPage = figma.root.children.find(p => p.name === pageName) as PageNode | undefined
  if (!designPage) {
    designPage = figma.createPage()
    designPage.name = pageName
  }
  await designPage.loadAsync()
  await figma.setCurrentPageAsync(designPage)

  // ── 4. Import selected screens (with per-node progress) ────────────────────
  const totalNodes = selectedScreens.reduce((sum, s) => sum + countNodes(s), 0)
  let nodesProcessed = 0

  ctx.progress = (_msg: string) => {
    nodesProcessed++
    send({
      type: 'PROGRESS',
      step: `Importing nodes`,
      current: nodesProcessed,
      total: totalNodes,
      phase: 'screens',
    })
  }

  let screensDone = 0
  for (const screen of selectedScreens) {
    send({
      type: 'PROGRESS',
      step: `Importing "${screen.name || screen.type}"`,
      current: nodesProcessed,
      total: totalNodes,
      phase: 'screens',
    })

    await transformNode(screen, designPage, ctx)
    screensDone++
  }

  // ── 5. Auto-layout: arrange screens left-to-right with 80px gap ──────────
  send({ type: 'PROGRESS', step: 'Arranging screens on canvas', current: totalNodes, total: totalNodes, phase: 'layout' })
  layoutScreensOnPage(designPage)

  // ── 6. Zoom to fit the newly imported screens ─────────────────────────────
  figma.viewport.scrollAndZoomIntoView(designPage.children)

  // ── 7. Done ───────────────────────────────────────────────────────────────
  send({
    type: 'DONE',
    screensImported: screensDone,
    fontWarnings,
    imageWarnings,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Font scanning
// ─────────────────────────────────────────────────────────────────────────────

async function runFontScan(msg: Extract<UIToPluginMessage, { type: 'SCAN_FONTS' }>) {
  const tree = resolveVariables(msg.tree)
  const allScreens = tree.children ?? []
  const selectedScreens = allScreens.filter(n => msg.selectedScreenIds.includes(n.id))

  // 1. Collect all unique font requirements from the selected screens
  const requirements = new Map<string, FontRequirement>()
  for (const screen of selectedScreens) {
    collectFontRequirements(screen, requirements)
  }

  // 2. Get available fonts from Figma
  const availableFonts = await figma.listAvailableFontsAsync()
  const availableFamilies = new Map<string, Set<string>>()
  for (const f of availableFonts) {
    const family = f.fontName.family
    if (!availableFamilies.has(family)) {
      availableFamilies.set(family, new Set())
    }
    availableFamilies.get(family)!.add(f.fontName.style)
  }

  // 3. Check each requirement and build suggestions for missing fonts
  const entries: FontScanEntry[] = []

  for (const req of requirements.values()) {
    const familyStyles = availableFamilies.get(req.family)
    const styles = resolveFontStyle(req.weight, req.isItalic)
    const isAvailable = familyStyles ? styles.some(s => familyStyles.has(s)) : false

    const suggestions: RequiredFont[] = []
    if (!isAvailable) {
      // Suggest similar families (prefix match)
      const lowerFamily = req.family.toLowerCase()
      const prefix = lowerFamily.split(/\s+/)[0]

      for (const [family, familyStyleSet] of availableFamilies) {
        if (family.toLowerCase().startsWith(prefix) && family !== req.family) {
          const matchingStyle = styles.find(s => familyStyleSet.has(s))
          if (matchingStyle) {
            suggestions.push({ family, style: matchingStyle })
          }
        }
      }

      // Always suggest Inter with matching weight as a fallback
      const interStyles = availableFamilies.get('Inter')
      if (interStyles) {
        const interMatch = styles.find(s => interStyles.has(s)) ?? 'Regular'
        suggestions.push({ family: 'Inter', style: interMatch })
      }

      // Suggest other common sans-serif fonts with matching weight
      for (const fallbackFamily of ['Roboto', 'Open Sans', 'Noto Sans', 'Source Sans Pro', 'Lato', 'Poppins', 'Montserrat']) {
        const fallbackStyles = availableFamilies.get(fallbackFamily)
        if (fallbackStyles) {
          const match = styles.find(s => fallbackStyles.has(s))
          if (match) {
            suggestions.push({ family: fallbackFamily, style: match })
          }
        }
      }
    }

    entries.push({
      required: req,
      available: isAvailable,
      suggestions,
    })
  }

  send({ type: 'FONT_SCAN_RESULT', entries })
}

/** Parse font weight string/number to a numeric weight */
function parseFontWeightForScan(fw: string | number | undefined): number {
  if (fw === undefined) return 400
  if (typeof fw === 'number') return fw
  const map: Record<string, number> = {
    thin: 100, extralight: 200, 'extra-light': 200, light: 300,
    normal: 400, regular: 400, medium: 500, semibold: 600, 'semi-bold': 600,
    bold: 700, extrabold: 800, 'extra-bold': 800, black: 900, heavy: 900,
  }
  return map[fw.toLowerCase()] ?? (parseInt(fw, 10) || 400)
}

/** Walk the node tree and collect all unique font requirements */
function collectFontRequirements(node: PencilNode, out: Map<string, FontRequirement>): void {
  const n = node as any

  if (n.fontFamily) {
    const weight = parseFontWeightForScan(n.fontWeight)
    const isItalic = n.fontStyle === 'italic'
    const styles = resolveFontStyle(weight, isItalic)
    const key = `${n.fontFamily}::${styles[0]}`
    if (!out.has(key)) {
      out.set(key, { family: n.fontFamily, weight, isItalic, style: styles[0] })
    }
  }

  // Rich text segments
  if (n.segments) {
    for (const seg of n.segments) {
      if (seg.fontFamily) {
        const weight = parseFontWeightForScan(seg.fontWeight ?? n.fontWeight)
        const isItalic = (seg.fontStyle ?? n.fontStyle) === 'italic'
        const styles = resolveFontStyle(weight, isItalic)
        const key = `${seg.fontFamily}::${styles[0]}`
        if (!out.has(key)) {
          out.set(key, { family: seg.fontFamily, weight, isItalic, style: styles[0] })
        }
      }
    }
  }

  // Icon fonts
  if (n.iconFontFamily) {
    const styles = resolveFontStyle(400, false)
    const key = `${n.iconFontFamily}::${styles[0]}`
    if (!out.has(key)) {
      out.set(key, { family: n.iconFontFamily, weight: 400, isItalic: false, style: styles[0] })
    }
  }

  if (node.children) {
    for (const child of node.children) {
      collectFontRequirements(child, out)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Arranges all top-level frames on a page side-by-side with a gap.
 * Frames that already have a non-zero y are left in place (re-imports).
 */
function layoutScreensOnPage(page: PageNode) {
  const GAP = 80
  let x = 0

  for (const node of page.children) {
    if ('x' in node) {
      node.x = x
      node.y = 0
      x += (node.width ?? 0) + GAP
    }
  }
}

function countNodes(node: PencilNode): number {
  let count = 1
  if (node.children) {
    for (const child of node.children) count += countNodes(child)
  }
  return count
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function send(msg: PluginToUIMessage) {
  figma.ui.postMessage(msg)
}

function log(level: LogMessage['level'], message: string) {
  console.log(`[pencil-to-figma] [${level}]`, message)
  send({ type: 'LOG', level, message })
}
