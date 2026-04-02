import { PenFile, PenVariable } from '../../shared/types'

// ─────────────────────────────────────────────────────────────────────────────
// Variable resolver — replaces "$varName" references with their resolved values
// throughout the entire .pen node tree before it reaches the transformer.
// ─────────────────────────────────────────────────────────────────────────────

type VarMap = Record<string, any>

/**
 * Build a flat lookup of variable name → resolved primitive value.
 * Handles themed variables by picking the first (default) value.
 */
function buildVarMap(variables: Record<string, PenVariable>): VarMap {
  const map: VarMap = {}
  for (const [name, def] of Object.entries(variables)) {
    const val = def.value
    if (Array.isArray(val)) {
      // Themed variable — use the first entry (default theme) value
      map[name] = val[0]?.value ?? val[0]
    } else {
      map[name] = val
    }
  }
  return map
}

/**
 * If `val` is a "$varName" string, resolve it from the map.
 * Returns the resolved value or the original if not a variable reference.
 */
function resolveValue(val: any, vars: VarMap): any {
  if (typeof val === 'string' && val.startsWith('$')) {
    const varName = val.slice(1) // strip leading "$"
    if (varName in vars) return vars[varName]
  }
  return val
}

/**
 * Recursively walk an object/array and resolve all "$varName" string references.
 * Returns a new object with all variables inlined.
 */
function resolveDeep(obj: any, vars: VarMap): any {
  if (obj === null || obj === undefined) return obj

  if (typeof obj === 'string') return resolveValue(obj, vars)

  if (Array.isArray(obj)) {
    return obj.map(item => resolveDeep(item, vars))
  }

  if (typeof obj === 'object') {
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveDeep(value, vars)
    }
    return result
  }

  return obj
}

/**
 * Resolve all variable references in the entire PenFile tree.
 * Mutates nothing — returns a new PenFile with all "$var" strings replaced.
 */
export function resolveVariables(file: PenFile): PenFile {
  if (!file.variables || Object.keys(file.variables).length === 0) {
    return file
  }

  const vars = buildVarMap(file.variables)
  const resolvedChildren = file.children
    ? resolveDeep(file.children, vars)
    : file.children

  return { ...file, children: resolvedChildren }
}
