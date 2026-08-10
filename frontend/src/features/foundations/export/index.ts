import type {
  FoundationsData,
  FoundationSemanticValue,
  FoundationToken,
} from "@/lib/types"
import { catalogFromData, displayValueForToken } from "../catalog"

function tokenPathParts(name: string): string[] {
  return name
    .split(/[/\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** background/neutral → background-neutral */
export function toCssVarName(token: FoundationToken): string {
  const web = token.codeSyntax?.WEB?.trim()
  if (web) {
    const match = web.match(/--([a-zA-Z0-9_-]+)/)
    if (match) return `--${match[1]}`
    if (web.startsWith("--")) return web
  }
  const slug = tokenPathParts(token.name)
    .join("-")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return `--${slug || "token"}`
}

/** background/neutral → backgroundNeutral */
export function toTsKey(token: FoundationToken): string {
  const parts = tokenPathParts(token.name)
  if (parts.length === 0) return "token"
  return parts
    .map((part, index) => {
      const clean = part.replace(/[^a-zA-Z0-9]+/g, "")
      if (!clean) return ""
      if (index === 0) return clean.charAt(0).toLowerCase() + clean.slice(1)
      return clean.charAt(0).toUpperCase() + clean.slice(1)
    })
    .join("")
}

function cssLiteral(value: FoundationSemanticValue | undefined): string | null {
  if (!value) return null
  switch (value.kind) {
    case "color":
      return value.css || value.hex || null
    case "paint":
      return value.css || value.hex || null
    case "number":
      return `${value.value}px`
    case "string":
      return JSON.stringify(value.value)
    case "boolean":
      return String(value.value)
    case "shadow":
      return `${value.inset ? "inset " : ""}${value.x}px ${value.y}px ${value.blur}px ${value.spread}px ${value.color}`
    case "blur":
      return `${value.radius}px`
    case "text":
      return JSON.stringify(
        `${value.family} ${value.weight} ${value.size}px/${value.lineHeight}`,
      )
    default:
      return null
  }
}

function collectModes(tokens: FoundationToken[]): { modeId: string; name: string }[] {
  const map = new Map<string, string>()
  for (const token of tokens) {
    for (const mode of token.modes ?? []) {
      if (!map.has(mode.modeId)) map.set(mode.modeId, mode.name)
    }
  }
  return [...map.entries()].map(([modeId, name]) => ({ modeId, name }))
}

function modeSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mode"
}

export function exportFoundationsCss(data: FoundationsData): string {
  const catalog = catalogFromData(data)
  const tokens = Object.values(catalog).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  const modes = collectModes(tokens)
  const lines: string[] = [
    "/* Generated from Design Handoff Foundations */",
    "",
  ]

  if (modes.length <= 1) {
    const modeId = modes[0]?.modeId ?? null
    lines.push(":root {")
    for (const token of tokens) {
      const { leaf } = displayValueForToken(token, modeId)
      const value = cssLiteral(leaf)
      if (!value) continue
      lines.push(`  ${toCssVarName(token)}: ${value};`)
    }
    lines.push("}", "")
    return lines.join("\n")
  }

  const defaultMode = modes[0]
  lines.push(":root {")
  for (const token of tokens) {
    const { leaf } = displayValueForToken(token, defaultMode.modeId)
    const value = cssLiteral(leaf)
    if (!value) continue
    lines.push(`  ${toCssVarName(token)}: ${value};`)
  }
  lines.push("}", "")

  for (const mode of modes.slice(1)) {
    lines.push(`[data-theme="${modeSlug(mode.name)}"] {`)
    for (const token of tokens) {
      const { leaf } = displayValueForToken(token, mode.modeId)
      const value = cssLiteral(leaf)
      if (!value) continue
      lines.push(`  ${toCssVarName(token)}: ${value};`)
    }
    lines.push("}", "")
  }

  return lines.join("\n")
}

export function exportFoundationsTypeScript(data: FoundationsData): string {
  const catalog = catalogFromData(data)
  const tokens = Object.values(catalog).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  const modes = collectModes(tokens)
  const lines: string[] = [
    "// Generated from Design Handoff Foundations",
    "",
    "export const tokens = {",
  ]

  for (const token of tokens) {
    const key = toTsKey(token)
    const cssVar = toCssVarName(token)

    if (modes.length <= 1) {
      const { leaf } = displayValueForToken(token, modes[0]?.modeId ?? null)
      const value = cssLiteral(leaf)
      if (!value) continue
      const lit = value.startsWith('"') ? value : JSON.stringify(value)
      lines.push(`  ${key}: {`)
      lines.push(`    value: ${lit},`)
      lines.push(`    cssVar: ${JSON.stringify(cssVar)},`)
      lines.push(`  },`)
      continue
    }

    lines.push(`  ${key}: {`)
    lines.push(`    cssVar: ${JSON.stringify(cssVar)},`)
    lines.push(`    modes: {`)
    for (const mode of modes) {
      const { leaf } = displayValueForToken(token, mode.modeId)
      const value = cssLiteral(leaf)
      if (!value) continue
      const lit = value.startsWith('"') ? value : JSON.stringify(value)
      lines.push(`      ${JSON.stringify(modeSlug(mode.name))}: ${lit},`)
    }
    lines.push(`    },`)
    lines.push(`  },`)
  }

  lines.push("} as const", "")
  lines.push("export type FoundationTokens = typeof tokens", "")
  return lines.join("\n")
}

export function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
