import { cn } from "@/lib/utils"
import type { FoundationSemanticValue, FoundationToken } from "@/lib/types"
import { displayValueForToken } from "../catalog"
import { colorFromValue, formatSemantic } from "../lib/grouping"

function ColorSwatch({
  color,
  className,
}: {
  color: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "border-border rounded-md border shadow-sm",
        className ?? "h-16 w-16",
      )}
      style={{ backgroundColor: color }}
      title={color}
    />
  )
}

function SpacingBar({ value }: { value: number }) {
  const width = Math.min(Math.max(value, 0) * 2, 220)
  return (
    <div className="flex items-center gap-2">
      <div className="bg-primary size-2 rounded-sm" />
      <div className="bg-primary/40 h-2 rounded-sm" style={{ width }} />
      <div className="bg-primary size-2 rounded-sm" />
      <span className="text-muted-foreground font-mono text-xs">{value}px</span>
    </div>
  )
}

function shadowCssFromValue(value: FoundationSemanticValue | undefined): string | null {
  if (!value) return null
  if (value.kind === "shadow") {
    const inset = value.inset ? "inset " : ""
    return `${inset}${value.x}px ${value.y}px ${value.blur}px ${value.spread}px ${value.color}`
  }
  if (value.kind === "shadows") {
    return value.shadows
      .map((s) => {
        const inset = s.inset ? "inset " : ""
        return `${inset}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`
      })
      .join(", ")
  }
  return null
}

function ShadowPreview({ boxShadow }: { boxShadow: string }) {
  return (
    <div className="bg-muted/50 flex h-24 items-center justify-center rounded-lg">
      <div
        className="bg-background border-border h-12 w-20 rounded-md border"
        style={{ boxShadow }}
      />
    </div>
  )
}

function BlurPreview({
  radius,
  type,
}: {
  radius: number
  type?: "LAYER_BLUR" | "BACKGROUND_BLUR"
}) {
  const isBg = type === "BACKGROUND_BLUR"
  return (
    <div className="bg-muted/50 relative flex h-24 items-center justify-center overflow-hidden rounded-lg">
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background:
            "linear-gradient(135deg, #f59e0b, #ef4444 40%, #8b5cf6)",
          ...(isBg ? { filter: `blur(${radius}px)` } : {}),
        }}
      />
      {!isBg && (
        <div
          className="relative z-10 h-14 w-14 rounded-full"
          style={{
            background: "linear-gradient(135deg, #6366f1, #ec4899)",
            filter: `blur(${radius}px)`,
          }}
        />
      )}
      {isBg && (
        <div className="bg-background/50 relative z-10 rounded-md border px-3 py-2 text-xs backdrop-blur-sm">
          background blur
        </div>
      )}
    </div>
  )
}

/** Large visual example of the token for the inspector panel. */
export function TokenPreview({
  token,
  modeId,
}: {
  token: FoundationToken
  modeId: string | null
}) {
  const { leaf } = displayValueForToken(token, modeId)
  const color = colorFromValue(leaf)

  if (token.category === "color" && color) {
    return (
      <div className="space-y-2">
        <ColorSwatch color={color} className="h-24 w-full rounded-lg" />
        <p className="font-mono text-sm">{formatSemantic(leaf)}</p>
      </div>
    )
  }

  if (token.category === "typography" && leaf?.kind === "text") {
    const sampleSize = Math.min(Math.max(leaf.size, 16), 40)
    return (
      <div className="space-y-3">
        <p
          className="break-words"
          style={{
            fontFamily: leaf.family,
            fontWeight: leaf.weight,
            fontSize: sampleSize,
            lineHeight:
              leaf.lineHeight === "auto" ? undefined : leaf.lineHeight,
            letterSpacing: leaf.letterSpacing,
          }}
        >
          The quick brown fox jumps
        </p>
        <p className="text-muted-foreground font-mono text-xs">
          {formatSemantic(leaf)}
        </p>
      </div>
    )
  }

  if (token.category === "number" && leaf?.kind === "number") {
    if (token.numberKind === "radius") {
      const r = Math.min(Math.max(leaf.value, 0), 48)
      return (
        <div className="space-y-2">
          <div className="bg-muted/50 flex h-24 items-center justify-center rounded-lg">
            <div
              className="bg-primary/80 size-16"
              style={{ borderRadius: r }}
            />
          </div>
          <p className="font-mono text-sm">{leaf.value}px radius</p>
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <div className="bg-muted/50 flex h-20 items-center rounded-lg px-4">
          <SpacingBar value={leaf.value} />
        </div>
        <p className="font-mono text-sm">{leaf.value}px</p>
      </div>
    )
  }

  if (token.category === "shadow") {
    const fromCss = token.css
      ?.replace(/^box-shadow:\s*/i, "")
      .replace(/;$/, "")
    const boxShadow = fromCss || shadowCssFromValue(leaf)
    if (boxShadow) {
      return (
        <div className="space-y-2">
          <ShadowPreview boxShadow={boxShadow} />
          <p className="text-muted-foreground font-mono text-xs">
            {formatSemantic(leaf)}
          </p>
        </div>
      )
    }
  }

  if (token.category === "blur") {
    if (leaf?.kind === "blur") {
      return (
        <div className="space-y-2">
          <BlurPreview radius={leaf.radius} type={leaf.type} />
          <p className="text-muted-foreground font-mono text-xs">
            {formatSemantic(leaf)}
          </p>
        </div>
      )
    }
    if (leaf?.kind === "blurs" && leaf.blurs[0]) {
      const first = leaf.blurs[0]
      return (
        <div className="space-y-2">
          <BlurPreview radius={first.radius} type={first.type} />
          <p className="text-muted-foreground font-mono text-xs">
            {formatSemantic(leaf)}
          </p>
        </div>
      )
    }
  }

  if (token.category === "grid" && leaf?.kind === "grid") {
    return (
      <div className="space-y-2">
        <div className="bg-muted/50 grid h-24 grid-cols-4 gap-1 rounded-lg p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-primary/20 rounded-sm" />
          ))}
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          {formatSemantic(leaf)}
        </p>
      </div>
    )
  }

  return (
    <p className="font-mono text-sm">{formatSemantic(leaf)}</p>
  )
}

export function TokenRowSwatch({
  token,
  modeId,
}: {
  token: FoundationToken
  modeId: string | null
}) {
  const { leaf } = displayValueForToken(token, modeId)
  const color = colorFromValue(leaf)
  if (color) {
    return (
      <span
        className="border-border size-3.5 shrink-0 rounded-sm border"
        style={{ backgroundColor: color }}
      />
    )
  }
  return (
    <span className="bg-muted text-muted-foreground flex size-3.5 shrink-0 items-center justify-center rounded-sm font-mono text-[8px]">
      {token.category.slice(0, 1).toUpperCase()}
    </span>
  )
}
