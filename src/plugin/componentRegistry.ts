import { PenFile, PencilNode } from '../../shared/types'

/**
 * Walks the entire .pen tree and collects every node that has `reusable: true`.
 * Returns them in definition order (parents before children), so we never
 * reference a component that hasn't been created yet.
 */
export function collectReusableNodes(file: PenFile): PencilNode[] {
  const result: PencilNode[] = []

  function walk(nodes: PencilNode[] | undefined) {
    if (!nodes) return
    for (const node of nodes) {
      if (node.reusable) {
        result.push(node)
      }
      walk(node.children)
    }
  }

  walk(file.children)
  return result
}

/**
 * Registry that maps a Pencil node id → the Figma ComponentNode created for it.
 * Used during the second pass to resolve `type: "ref"` instances.
 */
export class ComponentRegistry {
  private map = new Map<string, ComponentNode>()

  register(pencilId: string, component: ComponentNode) {
    this.map.set(pencilId, component)
  }

  get(pencilId: string): ComponentNode | undefined {
    return this.map.get(pencilId)
  }

  has(pencilId: string): boolean {
    return this.map.has(pencilId)
  }

  get size(): number {
    return this.map.size
  }
}
