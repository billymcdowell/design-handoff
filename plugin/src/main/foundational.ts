/// <reference types="@figma/plugin-typings" />

// ─── Foundational export: Figma variables + local styles ───────────────────

import type { FoundationalExport } from "../types"
import { rgbToHex } from "./cssEngine"

// 14.2 ── processVariableValue ───────────────────────────────────────────────
function processVariableValue(value: unknown, type: string): unknown {
  if (
    type === "COLOR" &&
    value &&
    typeof value === "object" &&
    "r" in value &&
    "g" in value &&
    "b" in value
  ) {
    const v = value as { r: number; g: number; b: number; a?: number }
    return {
      ...v,
      hex: rgbToHex(v.r, v.g, v.b),
      css: `rgba(${Math.round(v.r * 255)}, ${Math.round(v.g * 255)}, ${Math.round(
        v.b * 255,
      )}, ${v.a ?? 1})`,
    }
  }
  return value
}

// 14.1 ── getFoundationalElements ────────────────────────────────────────────
export async function getFoundationalElements(): Promise<FoundationalExport> {
  const exportData: FoundationalExport = {
    variables: {},
    styles: { paint: [], text: [], effect: [], grid: [] },
  }

  // --- Variables ---
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  for (const collection of collections) {
    const collectionExport = {
      id: collection.id,
      name: collection.name,
      modes: collection.modes,
      variables: [] as FoundationalExport["variables"][string]["variables"],
    }

    const variables = await Promise.all(
      collection.variableIds.map((id) =>
        figma.variables.getVariableByIdAsync(id),
      ),
    )

    for (const variable of variables) {
      if (!variable) continue
      const valuesByMode: Record<string, unknown> = {}
      for (const mode of collection.modes) {
        const value = variable.valuesByMode[mode.modeId]
        if (
          value &&
          typeof value === "object" &&
          "type" in value &&
          (value as { type: string }).type === "VARIABLE_ALIAS"
        ) {
          const alias = value as VariableAlias
          const aliasedVar = await figma.variables.getVariableByIdAsync(alias.id)
          valuesByMode[mode.modeId] = {
            type: "VARIABLE_ALIAS",
            id: alias.id,
            name: aliasedVar?.name || "Unknown Variable",
          }
        } else {
          valuesByMode[mode.modeId] = processVariableValue(
            value,
            variable.resolvedType,
          )
        }
      }

      collectionExport.variables.push({
        id: variable.id,
        name: variable.name,
        type: variable.resolvedType,
        valuesByMode,
        description: variable.description,
        scopes: variable.scopes,
        codeSyntax: variable.codeSyntax,
      })
    }

    exportData.variables[collection.name] = collectionExport
  }

  // --- Styles ---
  const paintStyles = await figma.getLocalPaintStylesAsync()
  exportData.styles.paint = paintStyles.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    paints: s.paints as unknown[],
  }))

  const textStyles = await figma.getLocalTextStylesAsync()
  exportData.styles.text = textStyles.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    fontName: s.fontName,
    fontSize: s.fontSize,
    fontWeight: 400, // placeholder — matches spec
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    textDecoration: s.textDecoration,
    paragraphIndent: s.paragraphIndent,
    paragraphSpacing: s.paragraphSpacing,
    textCase: s.textCase,
  }))

  const effectStyles = await figma.getLocalEffectStylesAsync()
  exportData.styles.effect = effectStyles.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    effects: s.effects as unknown[],
  }))

  const gridStyles = await figma.getLocalGridStylesAsync()
  exportData.styles.grid = gridStyles.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    layoutGrids: s.layoutGrids as unknown[],
  }))

  return exportData
}

// ── Counts for the foundations record ───────────────────────────────────────
export function countVariables(data: FoundationalExport): number {
  return Object.values(data.variables).reduce(
    (sum, c) => sum + c.variables.length,
    0,
  )
}

export function countStyles(data: FoundationalExport): number {
  const s = data.styles
  return s.paint.length + s.text.length + s.effect.length + s.grid.length
}
