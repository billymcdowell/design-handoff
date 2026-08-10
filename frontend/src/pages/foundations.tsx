import { useMemo, useState } from "react"
import { Link } from "react-router"
import { FoundationsViewer } from "@/features/foundations/components/foundations-viewer"
import {
  downloadTextFile,
  exportFoundationsCss,
  exportFoundationsTypeScript,
} from "@/features/foundations/export"
import { useSharedFoundations } from "@/hooks/data"
import { removeFoundationSource } from "@/lib/api"
import { isPocketBaseSuperuser } from "@/lib/auth"
import { pb } from "@/lib/pocketbase"
import type {
  FoundationCategory,
  FoundationHistoryChangedItem,
  FoundationHistoryEntry,
  FoundationHistoryItemRef,
  FoundationSource,
  FoundationsData,
  User,
} from "@/lib/types"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "Unknown"
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function canEditFoundations(): boolean {
  const record = pb.authStore.record as User | null
  if (!record) return false
  if (isPocketBaseSuperuser(record)) return true
  return record.role === "designer"
}

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (typeof value === "object" && value !== null && "kind" in value) {
    const v = value as Record<string, unknown>
    switch (v.kind) {
      case "color":
        return String(v.css ?? v.hex ?? "")
      case "number":
        return `${v.value}`
      case "boolean":
        return String(v.value)
      case "string":
        return String(v.value)
      case "alias":
        return `↪ ${String(v.aliasName)}`
      case "shadow": {
        const inset = v.inset ? "inset " : ""
        return `${inset}${v.x}px ${v.y}px ${v.blur}px ${v.spread}px ${v.color}`
      }
      case "blur":
        return `${v.type} · ${v.radius}px`
      case "shadows":
        return Array.isArray(v.shadows)
          ? `${v.shadows.length} shadow${v.shadows.length === 1 ? "" : "s"}`
          : "shadows"
      case "blurs":
        return Array.isArray(v.blurs)
          ? `${v.blurs.length} blur${v.blurs.length === 1 ? "" : "s"}`
          : "blurs"
      case "text":
        return `${v.family} ${v.weight} / ${v.size}px · lh ${v.lineHeight} · ls ${v.letterSpacing}`
      case "paint":
        return String(v.css ?? v.hex ?? "paint")
      case "grid":
        return Array.isArray(v.grids)
          ? `${v.grids.length} grid${v.grids.length === 1 ? "" : "s"}`
          : "grid"
      default:
        break
    }
  }
  if (Array.isArray(value)) {
    return value.map(formatChangeValue).join(", ")
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function labelForPath(path: string): string {
  const leaf = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1) : path
  const labels: Record<string, string> = {
    name: "Name",
    category: "Category",
    numberKind: "Number kind",
    css: "CSS",
    value: "Value",
    blur: "Blur",
    spread: "Spread",
    x: "X",
    y: "Y",
    color: "Color",
    opacity: "Opacity",
    inset: "Inset",
    radius: "Radius",
    type: "Type",
    family: "Font family",
    style: "Font style",
    size: "Size",
    weight: "Weight",
    lineHeight: "Line height",
    letterSpacing: "Letter spacing",
    hex: "Hex",
    aliasName: "Alias",
    aliasId: "Alias id",
  }
  if (labels[leaf]) {
    if (path.includes(".") && path !== leaf) {
      const parent = path.slice(0, path.lastIndexOf("."))
      if (parent !== "value" && !parent.startsWith("value.")) {
        return `${parent} · ${labels[leaf]}`
      }
      return labels[leaf]
    }
    return labels[leaf]
  }
  return path
}

/** Expand a whole semantic object change into only the keys that differ. */
function expandObjectDiff(
  before: unknown,
  after: unknown,
): Array<{ key: string; before: unknown; after: unknown }> | null {
  const b =
    before && typeof before === "object" && !Array.isArray(before)
      ? (before as Record<string, unknown>)
      : null
  const a =
    after && typeof after === "object" && !Array.isArray(after)
      ? (after as Record<string, unknown>)
      : null
  if (!b || !a) return null
  if (typeof b.kind === "string" && b.kind === a.kind) {
    const keys = new Set([...Object.keys(b), ...Object.keys(a)])
    keys.delete("kind")
    const rows: Array<{ key: string; before: unknown; after: unknown }> = []
    for (const key of keys) {
      const bv = b[key] ?? null
      const av = a[key] ?? null
      if (JSON.stringify(bv) === JSON.stringify(av)) continue
      rows.push({ key, before: bv, after: av })
    }
    return rows.length > 0 ? rows : null
  }
  return null
}

function ChangeValue({ value }: { value: unknown }) {
  const text = formatChangeValue(value)
  const color =
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    ((value as { kind?: string }).kind === "color" ||
      (value as { kind?: string }).kind === "paint")
      ? formatChangeValue(value)
      : typeof value === "string" &&
          (value.startsWith("#") || value.startsWith("rgb"))
        ? value
        : null

  return (
    <span className="inline-flex items-center gap-1.5">
      {color && (
        <span
          className="border-border inline-block size-3 shrink-0 rounded-sm border"
          style={{ backgroundColor: color }}
          title={color}
        />
      )}
      <span className="font-mono break-all">{text}</span>
    </span>
  )
}

function FieldDiffRow({
  label,
  before,
  after,
}: {
  label: string
  before: unknown
  after: unknown
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7rem_1fr_1fr] sm:items-start sm:gap-3">
      <span className="text-foreground text-xs font-medium">{label}</span>
      <div className="min-w-0">
        <p className="text-muted-foreground mb-0.5 text-[10px] uppercase tracking-wide">
          Previous
        </p>
        <div className="text-red-700 dark:text-red-400">
          <ChangeValue value={before} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground mb-0.5 text-[10px] uppercase tracking-wide">
          New
        </p>
        <div className="text-emerald-700 dark:text-emerald-400">
          <ChangeValue value={after} />
        </div>
      </div>
    </div>
  )
}

function TokenHistoryLink({
  id,
  name,
  category,
}: {
  id: string
  name: string
  category: FoundationCategory
}) {
  return (
    <Link
      to={`/foundations?token=${encodeURIComponent(id)}`}
      className="text-foreground hover:text-primary underline-offset-2 hover:underline"
    >
      {name}{" "}
      <span className="text-muted-foreground opacity-60">({category})</span>
    </Link>
  )
}

function SourcesList({
  sources,
  canRemove,
  removingKey,
  onRemove,
}: {
  sources: Record<string, FoundationSource>
  canRemove: boolean
  removingKey: string | null
  onRemove: (fileKey: string) => void
}) {
  const list = Object.values(sources).sort((a, b) =>
    a.fileName.localeCompare(b.fileName),
  )
  if (list.length === 0) return null

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">Sources</h2>
      <ul className="space-y-2 text-sm">
        {list.map((source) => (
          <li
            key={source.fileKey}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-2">
              <span className="text-foreground font-medium">{source.fileName}</span>
              <span>· last updated {formatWhen(source.updatedAt)}</span>
              <span>
                · {Object.keys(source.tokens ?? {}).length} tokens
              </span>
            </div>
            {canRemove && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={removingKey === source.fileKey}
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove “${source.fileName}” from foundations? This deletes that file’s tokens from the platform.`,
                    )
                  ) {
                    onRemove(source.fileKey)
                  }
                }}
              >
                {removingKey === source.fileKey ? "Removing…" : "Remove"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChangeList({
  label,
  items,
  tone,
}: {
  label: string
  items: FoundationHistoryItemRef[]
  tone: "added" | "removed"
}) {
  if (items.length === 0) return null
  const color =
    tone === "added"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-red-700 dark:text-red-400"
  return (
    <div className="space-y-1">
      <p className={`text-xs font-medium ${color}`}>
        {label} ({items.length})
      </p>
      <ul className="text-muted-foreground max-h-40 overflow-y-auto font-mono text-xs">
        {items.map((item) => (
          <li key={item.id}>
            <TokenHistoryLink id={item.id} name={item.name} category={item.category} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChangedList({ items }: { items: FoundationHistoryChangedItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
        Changed ({items.length})
      </p>
      <ul className="max-h-80 space-y-3 overflow-y-auto text-xs">
        {items.map((item) => (
          <li key={item.id} className="space-y-2 rounded border p-3">
            <p className="font-mono font-medium">
              <TokenHistoryLink
                id={item.id}
                name={item.name}
                category={item.category}
              />
            </p>
            <div className="space-y-3">
              {item.changes.flatMap((change, i) => {
                const expanded = expandObjectDiff(change.before, change.after)
                if (expanded) {
                  return expanded.map((row) => (
                    <FieldDiffRow
                      key={`${item.id}-${change.path}-${row.key}-${i}`}
                      label={labelForPath(
                        change.path === "value" || change.path.startsWith("value.")
                          ? row.key
                          : `${change.path}.${row.key}`,
                      )}
                      before={row.before}
                      after={row.after}
                    />
                  ))
                }
                if (
                  change.path === "css" &&
                  item.changes.some(
                    (c) =>
                      c.path === "value" ||
                      c.path.startsWith("value.") ||
                      c.path.endsWith(".blur") ||
                      c.path.endsWith(".color"),
                  )
                ) {
                  return []
                }
                return [
                  <FieldDiffRow
                    key={`${item.id}-${change.path}-${i}`}
                    label={labelForPath(change.path)}
                    before={change.before}
                    after={change.after}
                  />,
                ]
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

type HistoryFilter = {
  sourceFileKey: string | "all"
  category: FoundationCategory | "all"
  kind: "all" | "added" | "removed" | "changed"
}

function entryMatchesFilter(
  entry: FoundationHistoryEntry,
  filter: HistoryFilter,
): boolean {
  if (filter.sourceFileKey !== "all" && entry.fileKey !== filter.sourceFileKey) {
    return false
  }
  const { summary } = entry
  if (filter.kind === "added" && summary.added.length === 0 && summary.kind !== "initial") {
    return false
  }
  if (filter.kind === "removed" && summary.removed.length === 0) return false
  if (filter.kind === "changed" && summary.changed.length === 0) return false

  if (filter.category === "all") return true

  const refs = [
    ...summary.added,
    ...summary.removed,
    ...summary.changed,
  ]
  if (refs.length === 0) return summary.kind === "initial"
  return refs.some((r) => r.category === filter.category)
}

function filterSummary(
  entry: FoundationHistoryEntry,
  filter: HistoryFilter,
): FoundationHistoryEntry["summary"] {
  const { summary } = entry
  if (filter.category === "all" && filter.kind === "all") return summary

  const catOk = (c: FoundationCategory) =>
    filter.category === "all" || c === filter.category

  return {
    ...summary,
    added:
      filter.kind === "removed" || filter.kind === "changed"
        ? []
        : summary.added.filter((i) => catOk(i.category)),
    removed:
      filter.kind === "added" || filter.kind === "changed"
        ? []
        : summary.removed.filter((i) => catOk(i.category)),
    changed:
      filter.kind === "added" || filter.kind === "removed"
        ? []
        : summary.changed.filter((i) => catOk(i.category)),
  }
}

function RecentChanges({
  history,
  sources,
}: {
  history: FoundationHistoryEntry[]
  sources: Record<string, FoundationSource>
}) {
  const [filter, setFilter] = useState<HistoryFilter>({
    sourceFileKey: "all",
    category: "all",
    kind: "all",
  })

  const sourceOptions = useMemo(() => {
    const fromHistory = new Map<string, string>()
    for (const entry of history) {
      fromHistory.set(entry.fileKey, entry.fileName)
    }
    for (const source of Object.values(sources)) {
      fromHistory.set(source.fileKey, source.fileName)
    }
    return [...fromHistory.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [history, sources])

  if (history.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Recent changes</h2>
        <p className="text-muted-foreground text-sm">
          No change history yet. Sync foundations from the plugin to record
          diffs.
        </p>
      </div>
    )
  }

  const newestFirst = [...history].reverse().filter((entry) =>
    entryMatchesFilter(entry, filter),
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Recent changes</h2>
        <div className="flex flex-wrap gap-2">
          <select
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            value={filter.sourceFileKey}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                sourceFileKey: e.target.value as HistoryFilter["sourceFileKey"],
              }))
            }
          >
            <option value="all">All sources</option>
            {sourceOptions.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            value={filter.category}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                category: e.target.value as HistoryFilter["category"],
              }))
            }
          >
            <option value="all">All categories</option>
            <option value="color">Color</option>
            <option value="typography">Typography</option>
            <option value="number">Number</option>
            <option value="shadow">Shadow</option>
            <option value="blur">Blur</option>
            <option value="grid">Grid</option>
            <option value="other">Other</option>
          </select>
          <select
            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
            value={filter.kind}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                kind: e.target.value as HistoryFilter["kind"],
              }))
            }
          >
            <option value="all">All changes</option>
            <option value="added">Added</option>
            <option value="removed">Removed</option>
            <option value="changed">Changed</option>
          </select>
        </div>
      </div>

      {newestFirst.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No history entries match these filters.
        </p>
      ) : (
        <Accordion multiple className="w-full">
          {newestFirst.map((entry) => {
            const summary = filterSummary(entry, filter)
            if (summary.kind === "initial") {
              return (
                <AccordionItem key={entry.id} value={entry.id}>
                  <AccordionTrigger>
                    <span className="flex flex-wrap items-center gap-2 text-left">
                      <span className="font-medium">{entry.fileName}</span>
                      <span className="text-muted-foreground text-xs font-normal">
                        {formatWhen(entry.at)}
                      </span>
                      <Badge variant="secondary">
                        Initial sync · {summary.counts?.tokens ?? 0} tokens
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground text-sm">
                      First sync of this Figma file. Subsequent syncs will list
                      only added, removed, and changed tokens.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              )
            }

            if (summary.kind === "source_removed") {
              return (
                <AccordionItem key={entry.id} value={entry.id}>
                  <AccordionTrigger>
                    <span className="flex flex-wrap items-center gap-2 text-left">
                      <span className="font-medium">{entry.fileName}</span>
                      <span className="text-muted-foreground text-xs font-normal">
                        {formatWhen(entry.at)}
                      </span>
                      <Badge variant="destructive">
                        Removed source ·{" "}
                        {summary.counts?.tokens ?? summary.removed.length} tokens
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ChangeList
                      label="Removed"
                      items={summary.removed}
                      tone="removed"
                    />
                  </AccordionContent>
                </AccordionItem>
              )
            }

            const total =
              summary.added.length +
              summary.removed.length +
              summary.changed.length

            return (
              <AccordionItem key={entry.id} value={entry.id}>
                <AccordionTrigger>
                  <span className="flex flex-wrap items-center gap-2 text-left">
                    <span className="font-medium">{entry.fileName}</span>
                    <span className="text-muted-foreground text-xs font-normal">
                      {formatWhen(entry.at)}
                    </span>
                    <Badge variant="secondary">
                      +{summary.added.length} · −{summary.removed.length} · ~
                      {summary.changed.length}
                    </Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {total === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No semantic changes.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {(summary.added.length > 0 || summary.removed.length > 0) && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <ChangeList
                            label="Added"
                            items={summary.added}
                            tone="added"
                          />
                          <ChangeList
                            label="Removed"
                            items={summary.removed}
                            tone="removed"
                          />
                        </div>
                      )}
                      <ChangedList items={summary.changed} />
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
    </div>
  )
}

function ExportPanel({ data }: { data: FoundationsData }) {
  const [copied, setCopied] = useState<"css" | "ts" | null>(null)

  async function copy(kind: "css" | "ts") {
    const text =
      kind === "css" ? exportFoundationsCss(data) : exportFoundationsTypeScript(data)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">Export</h2>
      <p className="text-muted-foreground text-sm">
        Download or copy CSS custom properties and a TypeScript token map from
        the current catalog (aliases resolved).
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            downloadTextFile("foundations.css", exportFoundationsCss(data))
          }
        >
          Download CSS
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            downloadTextFile(
              "foundations.ts",
              exportFoundationsTypeScript(data),
            )
          }
        >
          Download TypeScript
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => void copy("css")}>
          {copied === "css" ? "Copied CSS" : "Copy CSS"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => void copy("ts")}>
          {copied === "ts" ? "Copied TS" : "Copy TypeScript"}
        </Button>
      </div>
    </div>
  )
}

function foundationsMeta(data: FoundationsData) {
  const sources = data.sources ?? {}
  const history = Array.isArray(data.history) ? data.history : []
  return { sources, history }
}

export default function FoundationsPage() {
  const { data: foundation, isLoading, refetch } = useSharedFoundations()
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  if (isLoading) return <div className="p-8">Loading foundations…</div>

  if (!foundation) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold">Foundations</h1>
        <p className="text-muted-foreground">
          No foundations yet. Sync local variables &amp; styles from each Figma
          file in the plugin — one shared catalog for the whole organization
          (tokens keyed by Figma id so renames update in place).
        </p>
      </div>
    )
  }

  const { sources, history } = foundationsMeta(foundation.data)
  const sourceCount = Object.keys(sources).length
  const canRemove = canEditFoundations()
  const tokenCount =
    foundation.variables_count + foundation.styles_count ||
    Object.keys(foundation.data.catalog ?? {}).length

  async function handleRemove(fileKey: string) {
    setRemovingKey(fileKey)
    setRemoveError(null)
    try {
      await removeFoundationSource(foundation!, fileKey)
      refetch()
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : String(err))
    } finally {
      setRemovingKey(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Foundations</h1>
        <p className="text-muted-foreground text-sm">
          Shared organization catalog
          {sourceCount > 0
            ? ` · ${sourceCount} Figma file${sourceCount === 1 ? "" : "s"}`
            : ""}{" "}
          · {tokenCount} tokens
          {foundation.variables_count || foundation.styles_count
            ? ` (${foundation.variables_count} variables · ${foundation.styles_count} styles)`
            : ""}
        </p>
        {removeError && (
          <p className="text-destructive mt-2 text-sm">{removeError}</p>
        )}
      </div>

      {sourceCount > 0 && (
        <SourcesList
          sources={sources}
          canRemove={canRemove}
          removingKey={removingKey}
          onRemove={(fileKey) => void handleRemove(fileKey)}
        />
      )}
      <ExportPanel data={foundation.data} />
      <RecentChanges history={history} sources={sources} />
      <FoundationsViewer data={foundation.data} />
    </div>
  )
}
