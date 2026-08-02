import { FoundationsViewer } from "@/features/foundations/components/foundations-viewer"
import { useUserFoundations } from "@/hooks/data"
import type {
  FoundationHistoryEntry,
  FoundationSource,
  FoundationsData,
} from "@/lib/types"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "Unknown"
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function SourcesList({ sources }: { sources: Record<string, FoundationSource> }) {
  const list = Object.values(sources).sort((a, b) =>
    a.fileName.localeCompare(b.fileName),
  )
  if (list.length === 0) return null

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">Sources</h2>
      <ul className="text-muted-foreground space-y-1 text-sm">
        {list.map((source) => (
          <li key={source.fileKey} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-foreground font-medium">{source.fileName}</span>
            <span>· last updated {formatWhen(source.updatedAt)}</span>
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
  items: string[]
  tone: "added" | "removed" | "changed"
}) {
  if (items.length === 0) return null
  const color =
    tone === "added"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "removed"
        ? "text-red-700 dark:text-red-400"
        : "text-amber-700 dark:text-amber-400"
  return (
    <div className="space-y-1">
      <p className={`text-xs font-medium ${color}`}>
        {label} ({items.length})
      </p>
      <ul className="text-muted-foreground max-h-40 overflow-y-auto font-mono text-xs">
        {items.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  )
}

function RecentChanges({ history }: { history: FoundationHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Recent changes</h2>
        <p className="text-muted-foreground text-sm">
          No change history yet. Re-publish variables &amp; styles from the
          plugin to start recording diffs.
        </p>
      </div>
    )
  }

  const newestFirst = [...history].reverse()

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">Recent changes</h2>
      <Accordion multiple className="w-full">
        {newestFirst.map((entry) => {
          const { summary } = entry
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
                  {total === 0 && (
                    <Badge variant="outline">no changes</Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {total === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Upload matched the previous snapshot for this file.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
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
                    <ChangeList
                      label="Changed"
                      items={summary.changed}
                      tone="changed"
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}

function foundationsMeta(data: FoundationsData) {
  const sources = data.sources ?? {}
  const history = Array.isArray(data.history) ? data.history : []
  return { sources, history }
}

export default function FoundationsPage() {
  const { data: foundation, isLoading } = useUserFoundations()

  if (isLoading) return <div className="p-8">Loading foundations…</div>

  if (!foundation) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold">Foundations</h1>
        <p className="text-muted-foreground">
          No foundations yet. Publish variables &amp; styles from each Figma
          file in the plugin — uploads merge by file and are shared across all
          of your projects.
        </p>
      </div>
    )
  }

  const { sources, history } = foundationsMeta(foundation.data)
  const sourceCount = Object.keys(sources).length

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Foundations</h1>
        <p className="text-muted-foreground text-sm">
          Shared across all projects
          {sourceCount > 0
            ? ` · ${sourceCount} Figma file${sourceCount === 1 ? "" : "s"}`
            : ""}{" "}
          · {foundation.variables_count} variables · {foundation.styles_count}{" "}
          styles
        </p>
      </div>

      {sourceCount > 0 && <SourcesList sources={sources} />}
      <RecentChanges history={history} />
      <FoundationsViewer data={foundation.data} />
    </div>
  )
}
