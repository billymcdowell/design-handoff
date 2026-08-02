import { useMemo, useState } from "react"
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
import { tokensFromData } from "../catalog"

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

function resolveValue(
  token: FoundationToken,
  modeId: string | null,
): FoundationSemanticValue | undefined {
  if (token.valuesByMode && modeId && token.valuesByMode[modeId]) {
    return token.valuesByMode[modeId]
  }
  if (token.valuesByMode) {
    const first = Object.values(token.valuesByMode)[0]
    if (first) return first
  }
  return token.value
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
}: {
  token: FoundationToken
  modeId: string | null
}) {
  const value = resolveValue(token, modeId)
  const color = colorFromValue(value)

  return (
    <div className="space-y-3 rounded-lg border p-3">
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

      {token.category === "color" && color && (
        <div className="flex items-center gap-3">
          <ColorSwatch color={color} />
          <span className="font-mono text-xs">{formatSemantic(value)}</span>
        </div>
      )}

      {token.category === "typography" && value?.kind === "text" && (
        <p
          style={{
            fontFamily: value.family,
            fontWeight: value.weight,
            fontSize: Math.min(value.size, 28),
            lineHeight: value.lineHeight === "auto" ? undefined : value.lineHeight,
            letterSpacing: value.letterSpacing,
          }}
        >
          The quick brown fox
          <span className="text-muted-foreground ml-2 font-mono text-xs">
            {formatSemantic(value)}
          </span>
        </p>
      )}

      {token.category === "number" && value?.kind === "number" && (
        token.numberKind === "spacing" ? (
          <SpacingBar value={value.value} />
        ) : (
          <span className="font-mono text-sm">{value.value}px</span>
        )
      )}

      {token.category === "shadow" && (
        <div className="space-y-2">
          {token.css && <ShadowPreview css={token.css} />}
          <p className="text-muted-foreground font-mono text-xs">
            {formatSemantic(value)}
          </p>
        </div>
      )}

      {token.category === "blur" && (
        <div className="space-y-2">
          {token.css && <BlurPreview css={token.css} />}
          <p className="text-muted-foreground font-mono text-xs">
            {formatSemantic(value)}
          </p>
        </div>
      )}

      {token.category === "grid" && value?.kind === "grid" && (
        <p className="text-muted-foreground font-mono text-xs">
          {(value.grids as Array<Record<string, unknown>>)
            .map((g) => String(g.pattern ?? g.alignment ?? "grid"))
            .join(", ") || "—"}
        </p>
      )}

      {(token.category === "other" ||
        (token.category === "typography" && value?.kind !== "text") ||
        (token.category === "color" && !color)) && (
        <p className="font-mono text-xs">{formatSemantic(value)}</p>
      )}

      {token.modes && token.modes.length > 1 && (
        <div className="border-border space-y-1 border-t pt-2">
          {token.modes.map((mode) => {
            const mv = token.valuesByMode?.[mode.modeId]
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
    </div>
  )
}

function NumberGroups({
  tokens,
  modeId,
}: {
  tokens: FoundationToken[]
  modeId: string | null
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {items.map((token) => (
                <TokenCard key={token.id} token={token} modeId={modeId} />
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
  const modes = useMemo(() => {
    const map = new Map<string, string>()
    for (const token of tokens) {
      for (const mode of token.modes ?? []) {
        if (!map.has(mode.modeId)) map.set(mode.modeId, mode.name)
      }
    }
    return [...map.entries()].map(([modeId, name]) => ({ modeId, name }))
  }, [tokens])

  const [modeId, setModeId] = useState<string | null>(null)
  const activeModeId = modeId ?? modes[0]?.modeId ?? null

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

  if (tokens.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No foundation tokens yet. Sync local variables &amp; styles from the
        Figma plugin.
      </p>
    )
  }

  const defaultTab =
    CATEGORIES.find((c) => byCategory[c.id].length > 0)?.id ?? "color"

  return (
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
              onClick={() => setModeId(mode.modeId)}
            >
              {mode.name}
            </Button>
          ))}
        </div>
      )}

      <Tabs defaultValue={defaultTab} className="w-full">
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
              <NumberGroups tokens={byCategory.number} modeId={activeModeId} />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {byCategory[cat.id].map((token) => (
                  <TokenCard
                    key={token.id}
                    token={token}
                    modeId={activeModeId}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
