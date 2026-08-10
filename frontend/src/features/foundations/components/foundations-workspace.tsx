import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  FoundationCategory,
  FoundationSource,
  FoundationsData,
  FoundationToken,
} from "@/lib/types"
import {
  catalogFromData,
  displayValueForToken,
  resolveTokenIdInCatalog,
  tokensFromData,
} from "../catalog"
import {
  downloadTextFile,
  exportFoundationsCss,
  exportFoundationsTypeScript,
} from "../export"
import {
  CATEGORY_LABELS,
  collectionKeyFor,
  filterTokens,
  findReferrers,
  formatSemantic,
  groupByCollection,
  groupSidebarSections,
  historyNewestFirst,
  STYLES_GROUP_NAME,
  tokenAliasSummary,
} from "../lib/grouping"
import { FoundationsHistoryPanel } from "./foundations-history"
import { TokenPreview, TokenRowSwatch } from "./token-preview"

type Workspace = "catalog" | "changes"

export type FoundationsWorkspaceProps = {
  data: FoundationsData
  variablesCount: number
  stylesCount: number
  canRemove: boolean
  removingKey: string | null
  removeError: string | null
  onRemove: (fileKey: string) => void
}

export function FoundationsWorkspace({
  data,
  variablesCount,
  stylesCount,
  canRemove,
  removingKey,
  removeError,
  onRemove,
}: FoundationsWorkspaceProps) {
  const tokens = useMemo(() => tokensFromData(data), [data])
  const catalog = useMemo(() => catalogFromData(data), [data])
  const collections = useMemo(() => groupByCollection(tokens), [tokens])
  const { sourceSections } = useMemo(
    () => groupSidebarSections(tokens),
    [tokens],
  )
  const history = useMemo(
    () => historyNewestFirst(data.history),
    [data.history],
  )
  const sources = Object.values(data.sources ?? {}).sort((a, b) =>
    a.fileName.localeCompare(b.fileName),
  )

  const [searchParams, setSearchParams] = useSearchParams()
  const workspace: Workspace =
    searchParams.get("ws") === "changes" ? "changes" : "catalog"

  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<FoundationCategory | "all">("all")
  const [collectionKey, setCollectionKey] = useState<string | "all">("all")
  const [modeByCollection, setModeByCollection] = useState<
    Record<string, string>
  >({})
  const [pendingRemove, setPendingRemove] = useState<FoundationSource | null>(
    null,
  )

  const activeCol =
    collectionKey === "all"
      ? null
      : (collections.find((c) => c.key === collectionKey) ?? null)

  function modeIdForToken(token: FoundationToken): string | null {
    const key = collectionKeyFor(token)
    const col = collections.find((c) => c.key === key)
    if (!col || col.modes.length === 0) return null
    return modeByCollection[col.key] ?? col.modes[0]?.modeId ?? null
  }

  const listModeId = activeCol
    ? (modeByCollection[activeCol.key] ?? activeCol.modes[0]?.modeId ?? null)
    : null

  const scoped = useMemo(() => {
    const base =
      collectionKey === "all"
        ? tokens
        : (collections.find((c) => c.key === collectionKey)?.tokens ?? [])
    return filterTokens(base, query, category)
  }, [tokens, collections, collectionKey, query, category])

  const selected = searchParams.get("token")
    ? resolveTokenIdInCatalog(catalog, searchParams.get("token")!)
    : null
  const selectedModeId = selected ? modeIdForToken(selected) : listModeId
  const referrers = selected ? findReferrers(catalog, selected) : []

  function setWorkspace(ws: Workspace) {
    const next = new URLSearchParams(searchParams)
    if (ws === "catalog") next.delete("ws")
    else next.set("ws", ws)
    setSearchParams(next, { replace: true })
  }

  function pickToken(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set("token", id)
    next.delete("ws")
    setSearchParams(next)
  }

  const tokenTotal = tokens.length

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-[28rem] flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Foundations</h1>
          <p className="text-muted-foreground text-xs">
            {sources.length} source{sources.length === 1 ? "" : "s"} ·{" "}
            {tokenTotal} tokens · {variablesCount} vars / {stylesCount} styles
          </p>
          {removeError && (
            <p className="text-destructive mt-1 text-xs">{removeError}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            <Button
              type="button"
              size="sm"
              className="h-8"
              variant={workspace === "catalog" ? "default" : "ghost"}
              onClick={() => setWorkspace("catalog")}
            >
              Catalog
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              variant={workspace === "changes" ? "default" : "ghost"}
              onClick={() => setWorkspace("changes")}
            >
              Changes
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {history.length}
              </Badge>
            </Button>
          </div>
          <div className="hidden gap-1 sm:flex">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() =>
                downloadTextFile("foundations.css", exportFoundationsCss(data))
              }
            >
              CSS
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() =>
                downloadTextFile(
                  "foundations.ts",
                  exportFoundationsTypeScript(data),
                )
              }
            >
              TS
            </Button>
          </div>
        </div>
      </header>

      {workspace === "catalog" ? (
        <div className="border-border grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
          {/* Sidebar */}
          <aside className="bg-muted/15 flex flex-col overflow-hidden border-b lg:border-r lg:border-b-0">
            <div className="border-border border-b px-3 py-2 text-[10px] font-medium tracking-wide uppercase">
              Collections
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <TreeButton
                active={collectionKey === "all"}
                onClick={() => setCollectionKey("all")}
                title="All"
                subtitle={`${tokenTotal} tokens`}
              />

              {sourceSections.map((section, sectionIndex) => (
                <div
                  key={section.sourceFileKey}
                  className={cn(
                    "pt-3",
                    sectionIndex > 0 && "border-border mt-3 border-t",
                  )}
                >
                  <div className="mb-1 flex items-start justify-between gap-1 px-1">
                    <div className="min-w-0">
                      <p className="text-muted-foreground truncate text-[10px] font-semibold tracking-wide uppercase">
                        {section.sourceFileName}
                      </p>
                      <p className="text-muted-foreground truncate text-[10px]">
                        {section.tokenCount} tokens
                      </p>
                    </div>
                    {canRemove && (
                      <button
                        type="button"
                        className="text-destructive shrink-0 text-[10px] hover:underline disabled:opacity-50"
                        disabled={removingKey === section.sourceFileKey}
                        onClick={() => {
                          const source = sources.find(
                            (s) => s.fileKey === section.sourceFileKey,
                          )
                          if (source) setPendingRemove(source)
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {section.collections.map((col) => (
                    <CollectionNav
                      key={col.key}
                      col={col}
                      active={collectionKey === col.key}
                      modeId={
                        modeByCollection[col.key] ??
                        col.modes[0]?.modeId ??
                        null
                      }
                      onSelect={() => setCollectionKey(col.key)}
                      onMode={(modeId) =>
                        setModeByCollection((p) => ({
                          ...p,
                          [col.key]: modeId,
                        }))
                      }
                    />
                  ))}
                  {section.styles && (
                    <CollectionNav
                      key={section.styles.key}
                      col={section.styles}
                      active={collectionKey === section.styles.key}
                      modeId={
                        modeByCollection[section.styles.key] ??
                        section.styles.modes[0]?.modeId ??
                        null
                      }
                      onSelect={() => setCollectionKey(section.styles!.key)}
                      onMode={(modeId) =>
                        setModeByCollection((p) => ({
                          ...p,
                          [section.styles!.key]: modeId,
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          </aside>

          {/* List */}
          <div className="flex min-h-0 flex-col overflow-hidden border-b lg:border-b-0">
            <div className="border-border space-y-2 border-b p-3">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tokens…"
                className="border-input bg-background focus-visible:ring-ring h-8 w-full rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
              />
              <div className="flex flex-wrap gap-1">
                <Chip
                  active={category === "all"}
                  onClick={() => setCategory("all")}
                  label="All"
                />
                {CATEGORY_LABELS.map((c) => (
                  <Chip
                    key={c.id}
                    active={category === c.id}
                    onClick={() => setCategory(c.id)}
                    label={c.label}
                  />
                ))}
              </div>
              <p className="text-muted-foreground text-[11px]">
                {scoped.length} token{scoped.length === 1 ? "" : "s"}
                {activeCol
                  ? ` · ${activeCol.collectionName}${
                      activeCol.isStyles
                        ? ` (${activeCol.sourceFileName})`
                        : ""
                    }`
                  : ""}
                {activeCol &&
                listModeId &&
                selectableModes(activeCol.modes).length > 0
                  ? ` · ${
                      activeCol.modes.find((m) => m.modeId === listModeId)?.name
                    }`
                  : ""}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {scoped.length === 0 ? (
                <p className="text-muted-foreground p-4 text-sm">
                  No tokens match.
                </p>
              ) : (
                scoped.map((t) => {
                  const modeId = activeCol
                    ? listModeId
                    : modeIdForToken(t)
                  const alias = tokenAliasSummary(t, modeId)
                  const { leaf } = displayValueForToken(t, modeId)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickToken(t.id)}
                      className={cn(
                        "hover:bg-muted/50 flex w-full items-center gap-2 border-b px-2 py-1.5 text-left transition-colors",
                        selected?.id === t.id &&
                          "bg-primary/10 border-l-primary border-l-2",
                      )}
                    >
                      <TokenRowSwatch token={t} modeId={modeId} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs">{t.name}</p>
                        {alias && (
                          <p className="text-muted-foreground truncate text-[10px]">
                            {alias}
                          </p>
                        )}
                      </div>
                      <span className="text-muted-foreground max-w-[7rem] shrink-0 truncate font-mono text-[10px]">
                        {formatSemantic(leaf)}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Inspector */}
          <div className="min-h-0 overflow-y-auto p-4">
            {!selected ? (
              <p className="text-muted-foreground text-sm">
                Select a token to see a visual example, resolved value, alias
                chain, and referrers.
              </p>
            ) : (
              <Inspector
                token={selected}
                modeId={selectedModeId}
                referrers={referrers}
                onPick={pickToken}
                missing={false}
              />
            )}
            {searchParams.get("token") && !selected && (
              <Inspector
                token={null}
                modeId={null}
                referrers={[]}
                onPick={pickToken}
                missing
                missingId={searchParams.get("token")}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="border-border min-h-0 flex-1 overflow-hidden rounded-xl border">
          <div className="border-border border-b px-4 py-3">
            <h2 className="text-sm font-medium">Change log</h2>
            <p className="text-muted-foreground text-xs">
              Expand a sync to compare previous vs new values. Click a token to
              open it in Catalog.
            </p>
          </div>
          <div className="max-h-full overflow-y-auto">
            <FoundationsHistoryPanel
              history={history}
              onPickToken={pickToken}
            />
          </div>
        </div>
      )}

      <AlertDialog
        open={!!pendingRemove}
        onOpenChange={(o) => !o && setPendingRemove(null)}
      >
        <AlertDialogContent className="sm:max-w-md" size="default">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove “{pendingRemove?.fileName}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-balance sm:text-left">
              This removes the entire Figma file from the shared Foundations
              catalog — not just one collection. All{" "}
              {pendingRemove
                ? Object.keys(pendingRemove.tokens ?? {}).length
                : 0}{" "}
              tokens from this source will be deleted from the platform, and a
              removal entry will be added to the change log. Other synced files
              stay. This cannot be undone except by syncing the file again from
              the plugin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={
                !!pendingRemove && removingKey === pendingRemove.fileKey
              }
              onClick={(e) => {
                e.preventDefault()
                if (!pendingRemove) return
                const key = pendingRemove.fileKey
                setPendingRemove(null)
                onRemove(key)
              }}
            >
              {pendingRemove && removingKey === pendingRemove.fileKey
                ? "Removing…"
                : "Remove source"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function isSoleDefaultMode(
  modes: { modeId: string; name: string }[],
): boolean {
  return (
    modes.length === 1 && modes[0]!.name.trim().toLowerCase() === "default"
  )
}

/** Modes worth showing in the sidebar (hide lone "default"). */
function selectableModes(
  modes: { modeId: string; name: string }[],
): { modeId: string; name: string }[] {
  if (isSoleDefaultMode(modes)) return []
  return modes
}

function CollectionNav({
  col,
  active,
  modeId,
  onSelect,
  onMode,
}: {
  col: ReturnType<typeof groupByCollection>[number]
  active: boolean
  modeId: string | null
  onSelect: () => void
  onMode: (modeId: string) => void
}) {
  const modes = selectableModes(col.modes)

  if (col.isStyles) {
    return (
      <div className="border-border mt-2 border-t border-dashed pt-2">
        <TreeButton
          active={active}
          onClick={onSelect}
          title={STYLES_GROUP_NAME}
          subtitle={`${col.tokens.length} style${col.tokens.length === 1 ? "" : "s"}`}
        />
      </div>
    )
  }

  return (
    <div className="mb-0.5">
      <TreeButton
        active={active}
        onClick={onSelect}
        title={col.collectionName}
        subtitle={`${col.tokens.length} tokens`}
      />
      {active && modes.length > 0 && (
        <div className="mt-0.5 ml-2 space-y-0.5 border-l py-1 pl-2">
          <p className="text-muted-foreground px-1 text-[10px] uppercase tracking-wide">
            Modes
          </p>
          {modes.map((m) => (
            <button
              key={m.modeId}
              type="button"
              className={cn(
                "block w-full rounded px-1.5 py-1 text-left text-[11px]",
                modeId === m.modeId
                  ? "bg-background font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onMode(m.modeId)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TreeButton({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean
  onClick: () => void
  title: string
  subtitle: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-md px-2 py-1.5 text-left",
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
      )}
    >
      <div className="truncate text-xs font-medium">{title}</div>
      <div
        className={cn(
          "truncate text-[10px]",
          active ? "opacity-80" : "text-muted-foreground",
        )}
      >
        {subtitle}
      </div>
    </button>
  )
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-0.5 text-[10px]",
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )
}

function Inspector({
  token,
  modeId,
  referrers,
  onPick,
  missing,
  missingId,
}: {
  token: FoundationToken | null
  modeId: string | null
  referrers: FoundationToken[]
  onPick: (id: string) => void
  missing?: boolean
  missingId?: string | null
}) {
  if (missing) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Token not found</h3>
        <p className="text-muted-foreground text-sm">
          Token <span className="font-mono">{missingId}</span> is not in
          Foundations. Ask a designer to sync the Figma library that defines it.
        </p>
      </div>
    )
  }
  if (!token) return null

  const { leaf, resolved } = displayValueForToken(token, modeId)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-mono text-sm font-semibold break-all">
          {token.name}
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          {token.sourceFileName}
          {token.collectionName
            ? ` · ${token.collectionName}`
            : ` · ${STYLES_GROUP_NAME}`}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{token.category}</Badge>
        <Badge variant="secondary">{token.origin}</Badge>
        {token.numberKind && (
          <Badge variant="secondary">{token.numberKind}</Badge>
        )}
      </div>

      <div>
        <h3 className="text-muted-foreground mb-2 text-[10px] font-medium tracking-wide uppercase">
          Example
        </h3>
        <TokenPreview token={token} modeId={modeId} />
      </div>

      {resolved?.unresolved && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Alias chain could not be fully resolved. Sync the globals / source
          library that defines the target variable.
        </p>
      )}

      {resolved && resolved.aliasChain.length > 0 && (
        <div>
          <h3 className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">
            Alias chain
          </h3>
          <ol className="list-decimal space-y-1 pl-4 font-mono text-xs">
            <li>{token.name}</li>
            {resolved.aliasChain.map((step) => (
              <li key={step.id}>
                <Link
                  className="text-foreground underline-offset-2 hover:underline"
                  to={`/foundations?token=${encodeURIComponent(step.id)}`}
                >
                  {step.name}
                </Link>
              </li>
            ))}
            {!resolved.unresolved && <li>{formatSemantic(leaf)}</li>}
          </ol>
        </div>
      )}

      {referrers.length > 0 && (
        <div>
          <h3 className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">
            Referenced by ({referrers.length})
          </h3>
          <ul className="space-y-1 font-mono text-xs">
            {referrers.slice(0, 20).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => onPick(r.id)}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {token.modes &&
        selectableModes(token.modes).length > 0 && (
        <div>
          <h3 className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wide uppercase">
            All modes
          </h3>
          <ul className="space-y-2">
            {token.modes.map((mode) => {
              const modeDisplay = displayValueForToken(token, mode.modeId)
              return (
                <li key={mode.modeId} className="text-xs">
                  <span className="text-muted-foreground block w-full">
                    {mode.name}
                  </span>
                  <span className="font-mono">
                    {formatSemantic(modeDisplay.leaf)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {token.description && (
        <p className="text-muted-foreground text-sm">{token.description}</p>
      )}
    </div>
  )
}
