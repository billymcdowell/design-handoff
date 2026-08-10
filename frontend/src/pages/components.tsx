import { useMemo, useState } from "react"
import { Link } from "react-router"
import { Box, Component } from "lucide-react"
import {
  formatComponentHistoryLabel,
  normalizeComponentLibrariesData,
} from "@/features/components/catalog"
import {
  useLibraryComponents,
  useSharedComponentLibrary,
} from "@/hooks/data"
import { removeComponentLibrarySource } from "@/lib/api"
import { isPocketBaseSuperuser } from "@/lib/auth"
import { libraryComponentPreviewSrc } from "@/lib/files"
import { pb } from "@/lib/pocketbase"
import type {
  ComponentLibraryHistoryEntry,
  ComponentLibrarySource,
  LibraryComponent,
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

function canEditComponents(): boolean {
  const record = pb.authStore.record as User | null
  if (!record) return false
  if (isPocketBaseSuperuser(record)) return true
  return record.role === "designer"
}

export default function ComponentsPage() {
  const {
    data: library,
    isLoading: loadingMeta,
    error: metaError,
    refetch: refetchMeta,
  } = useSharedComponentLibrary()
  const {
    data: components,
    isLoading: loadingComponents,
    error: componentsError,
    refetch: refetchComponents,
  } = useLibraryComponents()
  const [removingKey, setRemovingKey] = useState<string | null>(null)

  const data = useMemo(
    () => normalizeComponentLibrariesData(library?.data),
    [library?.data],
  )
  const sources = useMemo(
    () =>
      Object.values(data.sources).sort((a, b) =>
        a.fileName.localeCompare(b.fileName),
      ),
    [data.sources],
  )
  const history = useMemo(
    () => [...data.history].reverse().slice(0, 20),
    [data.history],
  )
  const list = components ?? []

  const { pageGroups, hiddenComponents } = useMemo(() => {
    const hidden: LibraryComponent[] = []
    const byPage = new Map<string, LibraryComponent[]>()

    for (const component of list) {
      if (component.hidden) {
        hidden.push(component)
        continue
      }
      const page = component.page_name?.trim() || "Uncategorized"
      const bucket = byPage.get(page)
      if (bucket) bucket.push(component)
      else byPage.set(page, [component])
    }

    const pages = Array.from(byPage.entries())
      .map(([pageName, items]) => ({
        pageName,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.pageName.localeCompare(b.pageName))

    hidden.sort((a, b) => a.name.localeCompare(b.name))
    return { pageGroups: pages, hiddenComponents: hidden }
  }, [list])

  async function handleRemoveSource(source: ComponentLibrarySource) {
    if (!library || !canEditComponents()) return
    setRemovingKey(source.fileKey)
    try {
      await removeComponentLibrarySource(library, source.fileKey)
      refetchMeta()
      refetchComponents()
    } finally {
      setRemovingKey(null)
    }
  }

  const isLoading = loadingMeta || loadingComponents
  const error = metaError || componentsError

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Component className="size-4" />
          <span>Shared across all projects</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Components</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Golden catalog of UI building blocks synced from Figma component
          libraries. Sync from the plugin with <strong>Sync components</strong>.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant="secondary">
            {library?.components_count ?? list.length} components
          </Badge>
          <Badge variant="outline">{sources.length} sources</Badge>
        </div>
      </header>

      {isLoading && (
        <p className="text-muted-foreground text-sm">Loading components…</p>
      )}
      {error != null && (
        <p className="text-destructive text-sm">
          Could not load components. Has the schema migration been applied?
        </p>
      )}

      {!isLoading && !error && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Sources</h2>
            {sources.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No component libraries synced yet. Open a Figma library file and
                use Sync components in the plugin.
              </p>
            ) : (
              <ul className="divide-border border rounded-lg divide-y">
                {sources.map((source) => (
                  <li
                    key={source.fileKey}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {source.fileName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {source.componentKeys.length} component
                        {source.componentKeys.length === 1 ? "" : "s"} · synced{" "}
                        {formatWhen(source.updatedAt)}
                      </p>
                    </div>
                    {canEditComponents() && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={removingKey === source.fileKey}
                        onClick={() => handleRemoveSource(source)}
                      >
                        {removingKey === source.fileKey ? "Removing…" : "Remove"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {history.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">Recent changes</h2>
              <Accordion multiple className="border rounded-lg px-4">
                {history.map((entry) => (
                  <HistoryItem key={entry.id} entry={entry} />
                ))}
              </Accordion>
            </section>
          )}

          <section className="flex flex-col gap-6">
            <h2 className="text-sm font-medium">Catalog</h2>
            {list.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No components in the catalog yet.
              </p>
            ) : (
              <div className="flex flex-col gap-8">
                {pageGroups.map((group) => (
                  <div key={group.pageName} className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{group.pageName}</h3>
                      <Badge variant="secondary" className="text-[10px]">
                        {group.items.length}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {group.items.map((component) => (
                        <ComponentCard
                          key={component.id}
                          component={component}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {pageGroups.length === 0 && hiddenComponents.length > 0 && (
                  <p className="text-muted-foreground text-sm">
                    All synced components are hidden. Expand Hidden below.
                  </p>
                )}

                {hiddenComponents.length > 0 && (
                  <Accordion className="border rounded-lg px-4">
                    <AccordionItem value="hidden">
                      <AccordionTrigger className="text-sm hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">Hidden</span>
                          <Badge variant="outline" className="text-[10px]">
                            {hiddenComponents.length}
                          </Badge>
                          <span className="text-muted-foreground font-normal text-xs">
                            Names or pages starting with . or _
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {hiddenComponents.map((component) => (
                            <ComponentCard
                              key={component.id}
                              component={component}
                            />
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function HistoryItem({ entry }: { entry: ComponentLibraryHistoryEntry }) {
  return (
    <AccordionItem value={entry.id}>
      <AccordionTrigger className="text-sm hover:no-underline">
        <span className="flex flex-wrap items-center gap-2 text-left">
          <span className="font-medium">{entry.fileName}</span>
          <span className="text-muted-foreground font-normal">
            {formatComponentHistoryLabel(entry.summary)}
          </span>
          <span className="text-muted-foreground font-normal text-xs">
            {formatWhen(entry.at)}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="text-muted-foreground flex flex-col gap-1 pb-2 text-xs">
          {entry.summary.added.length > 0 && (
            <p>Added: {entry.summary.added.map((i) => i.name).join(", ")}</p>
          )}
          {entry.summary.removed.length > 0 && (
            <p>Removed: {entry.summary.removed.map((i) => i.name).join(", ")}</p>
          )}
          {entry.summary.changed.length > 0 && (
            <p>Changed: {entry.summary.changed.map((i) => i.name).join(", ")}</p>
          )}
          {entry.summary.added.length === 0 &&
            entry.summary.removed.length === 0 &&
            entry.summary.changed.length === 0 && (
              <p>No item-level details.</p>
            )}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

function ComponentCard({ component }: { component: LibraryComponent }) {
  const preview = libraryComponentPreviewSrc(component)
  const variantCount = component.variants?.length ?? 0
  const tokenCount = component.tokens_used?.length ?? 0

  return (
    <Link
      to={`/components/${encodeURIComponent(component.key)}`}
      className="group border bg-card hover:border-foreground/20 flex flex-col overflow-hidden rounded-lg transition-colors"
    >
      <div className="bg-muted/40 flex aspect-[4/3] items-center justify-center overflow-hidden">
        {preview ? (
          <img
            src={preview}
            alt=""
            className="max-h-full max-w-full object-contain p-4"
          />
        ) : (
          <Box className="text-muted-foreground size-8 opacity-40" />
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="truncate font-medium text-sm group-hover:underline">
          {component.name}
        </p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px]">
            {component.kind === "COMPONENT_SET" ? "Set" : "Component"}
          </Badge>
          {component.page_name && (
            <Badge variant="outline" className="text-[10px]">
              {component.page_name}
            </Badge>
          )}
          {variantCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {variantCount} variant{variantCount === 1 ? "" : "s"}
            </Badge>
          )}
          {tokenCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {tokenCount} token{tokenCount === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  )
}
