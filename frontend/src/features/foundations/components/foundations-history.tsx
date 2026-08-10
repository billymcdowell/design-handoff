import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  FoundationCategory,
  FoundationHistoryChangedItem,
  FoundationHistoryEntry,
  FoundationHistoryItemRef,
} from "@/lib/types"
import { formatWhen, historyBadge } from "../lib/grouping"

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
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
    <div className="grid gap-2 sm:grid-cols-[6.5rem_1fr_1fr] sm:items-start sm:gap-3">
      <span className="text-foreground pt-0.5 text-xs font-medium">{label}</span>
      <div className="min-w-0 rounded-md bg-red-500/5 px-2 py-1.5 dark:bg-red-500/10">
        <p className="mb-0.5 text-[10px] font-medium tracking-wide text-red-700 uppercase dark:text-red-400">
          Previous
        </p>
        <div className="text-sm text-red-800 dark:text-red-300">
          <ChangeValue value={before} />
        </div>
      </div>
      <div className="min-w-0 rounded-md bg-emerald-500/5 px-2 py-1.5 dark:bg-emerald-500/10">
        <p className="mb-0.5 text-[10px] font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
          New
        </p>
        <div className="text-sm text-emerald-800 dark:text-emerald-300">
          <ChangeValue value={after} />
        </div>
      </div>
    </div>
  )
}

function TokenLink({
  id,
  name,
  category,
  onPick,
}: {
  id: string
  name: string
  category: FoundationCategory
  onPick: (id: string) => void
}) {
  return (
    <button
      type="button"
      className="text-foreground hover:text-primary font-mono underline-offset-2 hover:underline"
      onClick={() => onPick(id)}
    >
      {name}{" "}
      <span className="text-muted-foreground opacity-60">({category})</span>
    </button>
  )
}

function ChangeList({
  label,
  items,
  tone,
  onPick,
}: {
  label: string
  items: FoundationHistoryItemRef[]
  tone: "added" | "removed"
  onPick: (id: string) => void
}) {
  if (items.length === 0) return null
  const color =
    tone === "added"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-red-700 dark:text-red-400"
  return (
    <div className="space-y-1.5">
      <p className={cn("text-xs font-medium", color)}>
        {label} ({items.length})
      </p>
      <ul className="text-muted-foreground max-h-40 space-y-1 overflow-y-auto text-xs">
        {items.map((item) => (
          <li key={item.id}>
            <TokenLink
              id={item.id}
              name={item.name}
              category={item.category}
              onPick={onPick}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChangedList({
  items,
  onPick,
}: {
  items: FoundationHistoryChangedItem[]
  onPick: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
        Changed ({items.length})
      </p>
      <ul className="max-h-[28rem] space-y-3 overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.id}
            className="border-border space-y-3 rounded-lg border bg-background p-3"
          >
            <p className="text-sm font-medium">
              <TokenLink
                id={item.id}
                name={item.name}
                category={item.category}
                onPick={onPick}
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
                        change.path === "value" ||
                          change.path.startsWith("value.")
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

export function FoundationsHistoryPanel({
  history,
  onPickToken,
}: {
  history: FoundationHistoryEntry[]
  onPickToken: (id: string) => void
}) {
  if (history.length === 0) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        No change history yet. Sync foundations from the plugin to record diffs.
      </p>
    )
  }

  return (
    <ul className="divide-border divide-y">
      {history.map((entry) => (
        <HistoryEntry
          key={entry.id}
          entry={entry}
          onPickToken={onPickToken}
        />
      ))}
    </ul>
  )
}

function HistoryEntry({
  entry,
  onPickToken,
}: {
  entry: FoundationHistoryEntry
  onPickToken: (id: string) => void
}) {
  const badge = historyBadge(entry)
  const { summary } = entry
  const total =
    summary.added.length + summary.removed.length + summary.changed.length

  return (
    <li className="open:bg-muted/10">
      <details className="group">
        <summary className="hover:bg-muted/40 flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="font-medium">{entry.fileName}</span>
          <span className="text-muted-foreground text-xs">
            {formatWhen(entry.at)}
          </span>
          <Badge
            variant={badge.tone === "danger" ? "destructive" : "secondary"}
            className="text-[10px]"
          >
            {badge.label}
          </Badge>
        </summary>
        <div className="bg-muted/15 space-y-4 border-t px-4 py-4">
          {summary.kind === "initial" && (
            <p className="text-muted-foreground text-sm">
              First sync of this Figma file. Later syncs list only added,
              removed, and changed tokens with previous vs new values.
            </p>
          )}
          {summary.kind === "source_removed" && (
            <ChangeList
              label="Removed with source"
              items={summary.removed}
              tone="removed"
              onPick={onPickToken}
            />
          )}
          {summary.kind === "diff" && total === 0 && (
            <p className="text-muted-foreground text-sm">No semantic changes.</p>
          )}
          {summary.kind === "diff" && total > 0 && (
            <>
              {(summary.added.length > 0 || summary.removed.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <ChangeList
                    label="Added"
                    items={summary.added}
                    tone="added"
                    onPick={onPickToken}
                  />
                  <ChangeList
                    label="Removed"
                    items={summary.removed}
                    tone="removed"
                    onPick={onPickToken}
                  />
                </div>
              )}
              <ChangedList items={summary.changed} onPick={onPickToken} />
            </>
          )}
        </div>
      </details>
    </li>
  )
}
