import type {
  ComponentLibrariesData,
  ComponentLibraryHistoryEntry,
  ComponentLibrarySource,
} from "@/lib/types"

const HISTORY_CAP = 50

function emptyData(): ComponentLibrariesData {
  return { version: 1, sources: {}, history: [] }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function normalizeComponentLibrariesData(
  raw: unknown,
): ComponentLibrariesData {
  if (!isPlainObject(raw) || raw.version !== 1) return emptyData()
  const sources: Record<string, ComponentLibrarySource> = {}
  if (isPlainObject(raw.sources)) {
    for (const [key, value] of Object.entries(raw.sources)) {
      if (!isPlainObject(value)) continue
      const componentKeys = Array.isArray(value.componentKeys)
        ? value.componentKeys.filter((k): k is string => typeof k === "string")
        : []
      sources[key] = {
        fileKey: typeof value.fileKey === "string" ? value.fileKey : key,
        fileName: typeof value.fileName === "string" ? value.fileName : key,
        updatedAt:
          typeof value.updatedAt === "string"
            ? value.updatedAt
            : new Date().toISOString(),
        componentKeys,
      }
    }
  }
  const history: ComponentLibraryHistoryEntry[] = Array.isArray(raw.history)
    ? (raw.history as ComponentLibraryHistoryEntry[]).filter(
        (entry) => entry && typeof entry === "object" && typeof entry.id === "string",
      )
    : []
  return { version: 1, sources, history }
}

function historyId(): string {
  return `clh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function removeComponentLibrarySourceFromData(
  existingRaw: unknown,
  fileKey: string,
): {
  data: ComponentLibrariesData
  historyEntry: ComponentLibraryHistoryEntry | null
  deleteKeys: string[]
  componentsCount: number
} {
  const base = normalizeComponentLibrariesData(existingRaw)
  const prev = base.sources[fileKey]
  if (!prev) {
    const allKeys = new Set<string>()
    for (const src of Object.values(base.sources)) {
      for (const k of src.componentKeys) allKeys.add(k)
    }
    return {
      data: base,
      historyEntry: null,
      deleteKeys: [],
      componentsCount: allKeys.size,
    }
  }

  const sources = { ...base.sources }
  delete sources[fileKey]
  const deleteKeys = [...prev.componentKeys]
  const historyEntry: ComponentLibraryHistoryEntry = {
    id: historyId(),
    at: new Date().toISOString(),
    fileKey,
    fileName: prev.fileName,
    summary: {
      kind: "source_removed",
      added: [],
      removed: deleteKeys.map((key) => ({
        key,
        name: key,
        kind: "COMPONENT" as const,
      })),
      changed: [],
      counts: { components: 0 },
    },
  }
  const history = [...base.history, historyEntry].slice(-HISTORY_CAP)

  const allKeys = new Set<string>()
  for (const src of Object.values(sources)) {
    for (const k of src.componentKeys) allKeys.add(k)
  }

  return {
    data: { version: 1, sources, history },
    historyEntry,
    deleteKeys,
    componentsCount: allKeys.size,
  }
}

export function formatComponentHistoryLabel(
  summary: ComponentLibraryHistoryEntry["summary"],
): string {
  if (summary.kind === "initial") {
    const n = summary.counts?.components ?? summary.added.length
    return `Initial sync · ${n} component${n === 1 ? "" : "s"}`
  }
  if (summary.kind === "source_removed") return "Source removed"
  const parts: string[] = []
  if (summary.added.length) parts.push(`${summary.added.length} added`)
  if (summary.removed.length) parts.push(`${summary.removed.length} removed`)
  if (summary.changed.length) parts.push(`${summary.changed.length} changed`)
  return parts.length > 0 ? parts.join(" · ") : "Updated"
}
