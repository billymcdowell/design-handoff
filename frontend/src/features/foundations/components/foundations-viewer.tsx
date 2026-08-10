import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  FoundationCategory,
  FoundationNumberKind,
  FoundationsData,
  FoundationSemanticValue,
  FoundationToken,
} from "@/lib/types"
import {
  catalogFromData,
  displayValueForToken,
  resolveTokenIdInCatalog,
  tokensFromData,
} from "../catalog"

const CATEGORIES: { id: FoundationCategory; label: string }[] = [
  { id: "color", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "number", label: "Numbers" },
  { id: "shadow", label: "Shadows" },
  { id: "blur", label: "Blurs" },
  { id: "grid", label: "Grids" },
  { id: "other", label: "Other" },
]

function formatSemantic(value: FoundationSemanticValue | undefined): string {
  if (!value) return "—"
  switch (value.kind) {
    case "color":
      return value.css || value.hex
    case "number":
      return String(value.value)
    case "boolean":
      return String(value.value)
    case "string":
      return value.value
    case "alias":
      return `↪ ${value.aliasName}`
    case "shadow":
      return `${value.inset ? "inset " : ""}${value.x} ${value.y} ${value.blur} ${value.spread} ${value.color}`
    case "blur":
      return `${value.type} ${value.radius}px`
    case "shadows":
      return `${value.shadows.length} shadows`
    case "blurs":
      return `${value.blurs.length} blurs`
    case "text":
      return `${value.family} ${value.weight} / ${value.size}px`
    case "paint":
      return value.css || value.hex || "paint"
    case "grid":
      return `${value.grids.length} grid(s)`
    case "unknown":
      return JSON.stringify(value.raw)
    default:
      return "—"
  }
}

function colorFromValue(value: FoundationSemanticValue | undefined): string | null {
  if (!value) return null
  if (value.kind === "color") return value.css || value.hex
  if (value.kind === "paint") return value.css || value.hex || null
  return null
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // ignore
  }
}

function ColorSwatch({ color, size = "md" }: { color: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 w-8", md: "h-12 w-12", lg: "h-16 w-16" }
  return (
    <div
      className={cn("border-border rounded border shadow-sm", sizes[size])}
      style={{ backgroundColor: color }}
      title={color}
    />
  )
}

function SpacingBar({ value }: { value: number }) {
  const width = Math.min(Math.max(value, 0) * 2, 200)
  return (
    <div className="flex items-center gap-2">
      <div className="bg-primary size-2 rounded-sm" />
      <div className="bg-primary/40 h-2" style={{ width }} />
      <div className="bg-primary size-2 rounded-sm" />
      <span className="text-muted-foreground font-mono text-xs">{value}px</span>
    </div>
  )
}

function ShadowPreview({ css }: { css: string }) {
  const boxShadow = css.replace(/^box-shadow:\s*/i, "").replace(/;$/, "")
  return (
    <div className="bg-muted/40 flex h-20 items-center justify-center rounded-md">
      <div
        className="bg-background border-border h-10 w-16 rounded-md border"
        style={{ boxShadow }}
      />
    </div>
  )
}

function BlurPreview({ css }: { css: string }) {
  const filter = css.replace(/^filter:\s*/i, "").replace(/;$/, "")
  return (
    <div className="bg-muted/40 flex h-20 items-center justify-center overflow-hidden rounded-md">
      <div
        className="h-12 w-12 rounded-full"
        style={{
          background: "linear-gradient(135deg, #6366f1, #ec4899)",
          filter,
        }}
      />
    </div>
  )
}

function CopyCssButton({ css }: { css?: string }) {
  if (!css) return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={() => void copyText(css)}
    >
      Copy CSS
    </Button>
  )
}

function TokenCard({
  token,
  modeId,
  selected,
  onSelect,
}: {
  token: FoundationToken
  modeId: string | null
  selected?: boolean
  onSelect?: (token: FoundationToken) => void
}) {
  const { leaf, resolved } = displayValueForToken(token, modeId)
  const color = colorFromValue(leaf)
  const cardRef = useRef<HTMLButtonElement | HTMLDivElement | null>(null)

  useEffect(() => {
    if (selected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [selected])

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-sm">{token.name}</span>
            <Badge variant="outline">{token.category}</Badge>
            {token.numberKind && (
              <Badge variant="secondary">{token.numberKind}</Badge>
            )}
            {token.collectionName && (
              <span className="text-muted-foreground text-xs">
                {token.collectionName}
              </span>
            )}
          </div>
          {token.description && (
            <p className="text-muted-foreground mt-1 text-xs">{token.description}</p>
          )}
        </div>
        <CopyCssButton css={token.css} />
      </div>

      {resolved && resolved.aliasChain.length > 0 && (
        <p className="text-muted-foreground text-xs">
          {resolved.unresolved ? "Unresolved · " : ""}
          {resolved.aliasChain.map((s) => s.name).join(" → ")}
          {!resolved.unresolved ? ` → ${formatSemantic(leaf)}` : ""}
        </p>
      )}

      {token.category === "color" && color && (
        <div className="flex items-center gap-3">
          <ColorSwatch color={color} />
          <span className="font-mono text-xs">{formatSemantic(leaf)}</span>
        </div>
      )}

      {token.category === "typography" && leaf?.kind === "text" && (
        <p
          style={{
            fontFamily: leaf.family,
            fontWeight: leaf.weight,
            fontSize: Math.min(leaf.size, 28),
            lineHeight: leaf.lineHeight === "auto" ? undefined : leaf.lineHeight,
            letterSpacing: leaf.letterSpacing,
          }}
        >
          The quick brown fox
          <span className="text-muted-foreground ml-2 font-mono text-xs">
            {formatSemantic(leaf)}
          </span>
        </p>
      )}

      {token.category === "number" && leaf?.kind === "number" && (
        token.numberKind === "spacing" ? (
          <SpacingBar value={leaf.value} />
        ) : (
          <span className="font-mono text-sm">{leaf.value}px</span>
        )
      )}

      {token.category === "shadow" && (
        <div className="space-y-2">
          {token.css && <ShadowPreview css={token.css} />}
          <p className="text-muted-foreground font-mono text-xs">
            {formatSemantic(leaf)}
          </p>
        </div>
      )}

      {token.category === "blur" && (
        <div className="space-y-2">
          {token.css && <BlurPreview css={token.css} />}
          <p className="text-muted-foreground font-mono text-xs">
            {formatSemantic(leaf)}
          </p>
        </div>
      )}

      {token.category === "grid" && leaf?.kind === "grid" && (
        <p className="text-muted-foreground font-mono text-xs">
          {(leaf.grids as Array<Record<string, unknown>>)
            .map((g) => String(g.pattern ?? g.alignment ?? "grid"))
            .join(", ") || "—"}
        </p>
      )}

      {(token.category === "other" ||
        (token.category === "typography" && leaf?.kind !== "text") ||
        (token.category === "color" && !color)) && (
        <p className="font-mono text-xs">{formatSemantic(leaf)}</p>
      )}

      {token.modes && token.modes.length > 1 && (
        <div className="border-border space-y-1 border-t pt-2">
          {token.modes.map((mode) => {
            const { leaf: mv } = displayValueForToken(token, mode.modeId)
            const mc = colorFromValue(mv)
            return (
              <div key={mode.modeId} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-24 shrink-0">{mode.name}</span>
                {mc && <ColorSwatch color={mc} size="sm" />}
                <span className="font-mono">{formatSemantic(mv)}</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )

  const className = cn(
    "space-y-3 rounded-lg border p-3 text-left transition-colors",
    selected && "border-primary ring-primary/30 ring-2",
    onSelect && "hover:bg-muted/40 cursor-pointer",
  )

  if (onSelect) {
    return (
      <button
        ref={cardRef as React.RefObject<HTMLButtonElement>}
        type="button"
        className={className}
        onClick={() => onSelect(token)}
      >
        {body}
      </button>
    )
  }

  return (
    <div ref={cardRef as React.RefObject<HTMLDivElement>} className={className}>
      {body}
    </div>
  )
}

function TokenDetailPanel({
  token,
  modeId,
  missingId,
  onClose,
}: {
  token: FoundationToken | null
  modeId: string | null
  missingId: string | null
  onClose: () => void
}) {
  if (missingId && !token) {
    return (
      <aside className="border-border bg-muted/20 sticky top-4 space-y-3 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium">Token not found</h3>
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onClose}>
            Close
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Token <span className="font-mono">{missingId}</span> is not in Foundations.
          Ask a designer to sync the Figma library that defines it.
        </p>
      </aside>
    )
  }

  if (!token) return null

  const { leaf, resolved, raw } = displayValueForToken(token, modeId)
  const color = colorFromValue(leaf)

  return (
    <aside className="border-border sticky top-4 space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-mono text-sm font-medium break-all">{token.name}</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            {token.sourceFileName}
            {token.collectionName ? ` · ${token.collectionName}` : ""}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{token.category}</Badge>
        <Badge variant="secondary">{token.origin}</Badge>
        {token.numberKind && <Badge variant="secondary">{token.numberKind}</Badge>}
      </div>

      {color && (
        <div className="flex items-center gap-3">
          <ColorSwatch color={color} size="lg" />
          <div className="space-y-1">
            <p className="font-mono text-sm">{formatSemantic(leaf)}</p>
            {resolved?.aliasChain.length ? (
              <p className="text-muted-foreground text-xs">
                via {resolved.aliasChain.map((s) => s.name).join(" → ")}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {!color && (
        <p className="font-mono text-sm">{formatSemantic(leaf)}</p>
      )}

      {resolved?.unresolved && (
        <p className="text-amber-700 dark:text-amber-400 text-xs">
          Alias chain could not be fully resolved. Sync the globals / source
          library that defines the target variable.
        </p>
      )}

      {resolved && resolved.aliasChain.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-muted-foreground text-xs font-medium">Alias chain</h4>
          <ol className="text-muted-foreground list-decimal space-y-1 pl-4 font-mono text-xs">
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

      {token.modes && token.modes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-muted-foreground text-xs font-medium">Modes</h4>
          <ul className="space-y-2">
            {token.modes.map((mode) => {
              const modeDisplay = displayValueForToken(token, mode.modeId)
              const mc = colorFromValue(modeDisplay.leaf)
              return (
                <li
                  key={mode.modeId}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="text-muted-foreground w-24 shrink-0">
                    {mode.name}
                  </span>
                  {mc && <ColorSwatch color={mc} size="sm" />}
                  <span className="font-mono">{formatSemantic(modeDisplay.leaf)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {raw?.kind === "alias" && (
        <p className="text-muted-foreground text-xs">
          Raw binding: ↪ {raw.aliasName}
        </p>
      )}

      {token.description && (
        <p className="text-muted-foreground text-sm">{token.description}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <CopyCssButton css={token.css || (color ?? undefined)} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => void copyText(token.name)}
        >
          Copy name
        </Button>
      </div>
    </aside>
  )
}

function NumberGroups({
  tokens,
  modeId,
  selectedId,
  onSelect,
}: {
  tokens: FoundationToken[]
  modeId: string | null
  selectedId: string | null
  onSelect: (token: FoundationToken) => void
}) {
  const groups: { kind: FoundationNumberKind; label: string }[] = [
    { kind: "spacing", label: "Spacing" },
    { kind: "radius", label: "Radius" },
    { kind: "other", label: "Other numbers" },
  ]
  return (
    <div className="space-y-6">
      {groups.map(({ kind, label }) => {
        const items = tokens.filter((t) => (t.numberKind ?? "other") === kind)
        if (items.length === 0) return null
        return (
          <div key={kind} className="space-y-2">
            <h3 className="text-sm font-medium">
              {label}{" "}
              <Badge variant="secondary">{items.length}</Badge>
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {items.map((token) => (
                <TokenCard
                  key={token.id}
                  token={token}
                  modeId={modeId}
                  selected={selectedId === token.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function FoundationsViewer({ data }: { data: FoundationsData }) {
  const tokens = useMemo(() => tokensFromData(data), [data])
  const catalog = useMemo(() => catalogFromData(data), [data])
  const [searchParams, setSearchParams] = useSearchParams()
  const tokenParam = searchParams.get("token")
  const modeParam = searchParams.get("mode")

  const modes = useMemo(() => {
    const map = new Map<string, string>()
    for (const token of tokens) {
      for (const mode of token.modes ?? []) {
        if (!map.has(mode.modeId)) map.set(mode.modeId, mode.name)
      }
    }
    return [...map.entries()].map(([modeId, name]) => ({ modeId, name }))
  }, [tokens])

  const [modeId, setModeId] = useState<string | null>(modeParam)
  const activeModeId = modeId ?? modes[0]?.modeId ?? null

  useEffect(() => {
    if (modeParam) setModeId(modeParam)
  }, [modeParam])

  const selectedToken = useMemo(() => {
    if (!tokenParam) return null
    return resolveTokenIdInCatalog(catalog, tokenParam)
  }, [catalog, tokenParam])

  const missingId =
    tokenParam && !selectedToken ? tokenParam : null

  const byCategory = useMemo(() => {
    const map: Record<FoundationCategory, FoundationToken[]> = {
      color: [],
      typography: [],
      number: [],
      shadow: [],
      blur: [],
      grid: [],
      other: [],
    }
    for (const token of tokens) {
      const category = token.category in map ? token.category : "other"
      map[category].push(token)
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [tokens])

  const defaultTab =
    selectedToken?.category ??
    CATEGORIES.find((c) => byCategory[c.id].length > 0)?.id ??
    "color"

  const [tab, setTab] = useState<string>(defaultTab)

  useEffect(() => {
    if (selectedToken) setTab(selectedToken.category)
  }, [selectedToken])

  const selectToken = (token: FoundationToken) => {
    const next = new URLSearchParams(searchParams)
    next.set("token", token.id)
    if (activeModeId) next.set("mode", activeModeId)
    setSearchParams(next, { replace: false })
  }

  const clearSelection = () => {
    const next = new URLSearchParams(searchParams)
    next.delete("token")
    setSearchParams(next, { replace: true })
  }

  if (tokens.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No foundation tokens yet. Sync local variables &amp; styles from the
        Figma plugin.
      </p>
    )
  }

  return (
    <div
      className={cn(
        "gap-6",
        selectedToken || missingId
          ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]"
          : "block",
      )}
    >
      <div className="space-y-4">
        {modes.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm">Mode</span>
            {modes.map((mode) => (
              <Button
                key={mode.modeId}
                type="button"
                size="sm"
                variant={activeModeId === mode.modeId ? "default" : "outline"}
                onClick={() => {
                  setModeId(mode.modeId)
                  const next = new URLSearchParams(searchParams)
                  next.set("mode", mode.modeId)
                  setSearchParams(next, { replace: true })
                }}
              >
                {mode.name}
              </Button>
            ))}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="flex h-auto flex-wrap gap-1">
            {CATEGORIES.map((cat) => (
              <TabsTrigger key={cat.id} value={cat.id} className="gap-1">
                {cat.label}
                <Badge variant="secondary" className="text-[10px]">
                  {byCategory[cat.id].length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {CATEGORIES.map((cat) => (
            <TabsContent key={cat.id} value={cat.id} className="mt-4">
              {byCategory[cat.id].length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No {cat.label.toLowerCase()} tokens.
                </p>
              ) : cat.id === "number" ? (
                <NumberGroups
                  tokens={byCategory.number}
                  modeId={activeModeId}
                  selectedId={selectedToken?.id ?? null}
                  onSelect={selectToken}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {byCategory[cat.id].map((token) => (
                    <TokenCard
                      key={token.id}
                      token={token}
                      modeId={activeModeId}
                      selected={selectedToken?.id === token.id}
                      onSelect={selectToken}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {(selectedToken || missingId) && (
        <TokenDetailPanel
          token={selectedToken}
          modeId={activeModeId}
          missingId={missingId}
          onClose={clearSelection}
        />
      )}
    </div>
  )
}
