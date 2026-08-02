import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { FoundationsData } from "@/lib/types"

// ─── Value helpers ──────────────────────────────────────────
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>
    if (v.type === "VARIABLE_ALIAS" && typeof v.name === "string") return `↪ ${v.name}`
    if (typeof v.css === "string") return v.css
    if (typeof v.hex === "string") return v.hex
  }
  return JSON.stringify(value)
}

function parseColor(value: unknown): string | null {
  if (typeof value === "string") {
    const s = value.trim()
    if (s.startsWith("#") || s.startsWith("rgb") || s.startsWith("hsl")) return s
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`
    return null
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>
    if (typeof v.css === "string") return v.css
    if (typeof v.hex === "string") return v.hex
    const rgba = (v.rgba as Record<string, unknown>) || v
    const r = rgba.r as number | undefined
    const g = rgba.g as number | undefined
    const b = rgba.b as number | undefined
    if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
      // Figma colors are 0–1 floats.
      const to255 = (n: number) => Math.round((n <= 1 ? n * 255 : n))
      const a = typeof rgba.a === "number" ? rgba.a : 1
      return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${a})`
    }
  }
  return null
}

function isSpacingVariable(name: string, type: string): boolean {
  if (type !== "FLOAT") return false
  return /spacing|gap|padding|margin|size|space/i.test(name)
}

function isTypographyVariable(name: string): boolean {
  return /font|text|line|letter|typography|heading|body/i.test(name)
}

// ─── Previews ───────────────────────────────────────────────
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

function SpacingExample({ value }: { value: number }) {
  const width = Math.min(value * 2, 200)
  return (
    <div className="flex items-center gap-2">
      <div className="bg-primary size-2 rounded-sm" />
      <div className="bg-primary/40 h-2" style={{ width }} />
      <div className="bg-primary size-2 rounded-sm" />
      <span className="text-muted-foreground ml-2 font-mono text-xs">{value}px</span>
    </div>
  )
}

function RawJson({ data }: { data: unknown }) {
  return (
    <details className="mt-2">
      <summary className="text-muted-foreground cursor-pointer text-xs">Raw JSON</summary>
      <pre className="bg-muted mt-2 max-w-full overflow-x-auto rounded-md p-2 font-mono text-[11px]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  )
}

// ─── Main ───────────────────────────────────────────────────
export function FoundationsViewer({ data }: { data: FoundationsData }) {
  const collections = Object.values(data.variables || {})
  const styles = data.styles || {}

  return (
    <Tabs defaultValue="variables" className="w-full">
      <TabsList>
        <TabsTrigger value="variables">Variables</TabsTrigger>
        <TabsTrigger value="styles">Styles</TabsTrigger>
      </TabsList>

      <TabsContent value="variables" className="mt-4">
        {collections.length === 0 ? (
          <p className="text-muted-foreground text-sm">No variables in this project.</p>
        ) : (
          <Accordion multiple className="w-full">
            {collections.map((collection) => (
              <AccordionItem key={collection.id} value={collection.id}>
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    {collection.name}
                    <Badge variant="secondary">{collection.variables.length}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    {collection.variables.map((variable) => (
                      <div key={variable.id} className="rounded-lg border p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="font-mono text-sm">{variable.name}</span>
                          <Badge variant="outline">{variable.type}</Badge>
                        </div>
                        {variable.description && (
                          <p className="text-muted-foreground mb-2 text-xs">{variable.description}</p>
                        )}
                        <div className="space-y-2">
                          {collection.modes.map((mode) => {
                            const raw = variable.valuesByMode?.[mode.modeId]
                            const color = variable.type === "COLOR" ? parseColor(raw) : null
                            return (
                              <div key={mode.modeId} className="flex items-center gap-3">
                                <span className="text-muted-foreground w-20 shrink-0 text-xs">
                                  {mode.name}
                                </span>
                                {color ? (
                                  <div className="flex items-center gap-2">
                                    <ColorSwatch color={color} size="sm" />
                                    <span className="font-mono text-xs">{formatValue(raw)}</span>
                                  </div>
                                ) : isSpacingVariable(variable.name, variable.type) &&
                                  typeof raw === "number" ? (
                                  <SpacingExample value={raw} />
                                ) : isTypographyVariable(variable.name) ? (
                                  <span
                                    className="text-sm"
                                    style={{ fontFamily: typeof raw === "string" ? raw : undefined }}
                                  >
                                    {formatValue(raw)}
                                  </span>
                                ) : (
                                  <span className="font-mono text-xs">{formatValue(raw)}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        <RawJson data={variable} />
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </TabsContent>

      <TabsContent value="styles" className="mt-4">
        <StylesTab styles={styles} />
      </TabsContent>
    </Tabs>
  )
}

function StylesTab({ styles }: { styles: NonNullable<FoundationsData["styles"]> }) {
  return (
    <Tabs defaultValue="paint" className="w-full">
      <TabsList>
        <TabsTrigger value="paint">Paint ({styles.paint?.length ?? 0})</TabsTrigger>
        <TabsTrigger value="text">Text ({styles.text?.length ?? 0})</TabsTrigger>
        <TabsTrigger value="effect">Effect ({styles.effect?.length ?? 0})</TabsTrigger>
        <TabsTrigger value="grid">Grid ({styles.grid?.length ?? 0})</TabsTrigger>
      </TabsList>

      <TabsContent value="paint" className="mt-4">
        <StyleGrid
          items={styles.paint ?? []}
          renderPreview={(style) => {
            const paints = (style.paints as Array<Record<string, unknown>>) || []
            return (
              <div className="flex flex-wrap gap-2">
                {paints.map((paint, i) => {
                  const color = parseColor(paint.color ?? paint)
                  return color ? <ColorSwatch key={i} color={color} /> : null
                })}
              </div>
            )
          }}
        />
      </TabsContent>

      <TabsContent value="text" className="mt-4">
        <StyleGrid
          items={styles.text ?? []}
          renderPreview={(style) => (
            <p
              style={{
                fontFamily: style.fontName?.family,
                fontSize: style.fontSize ? Math.min(style.fontSize, 32) : undefined,
              }}
            >
              {style.fontName?.family ?? "Sample"} {style.fontSize ? `· ${style.fontSize}px` : ""}
            </p>
          )}
        />
      </TabsContent>

      <TabsContent value="effect" className="mt-4">
        <StyleGrid
          items={styles.effect ?? []}
          renderPreview={(style) => (
            <div className="text-muted-foreground text-xs">
              {((style.effects as Array<Record<string, unknown>>) || [])
                .map((e) => String(e.type))
                .join(", ") || "—"}
            </div>
          )}
        />
      </TabsContent>

      <TabsContent value="grid" className="mt-4">
        <StyleGrid
          items={styles.grid ?? []}
          renderPreview={(style) => (
            <div className="text-muted-foreground text-xs">
              {((style.layoutGrids as Array<Record<string, unknown>>) || [])
                .map((g) => String(g.pattern ?? g.alignment ?? "grid"))
                .join(", ") || "—"}
            </div>
          )}
        />
      </TabsContent>
    </Tabs>
  )
}

function StyleGrid<T extends { id: string; name: string; description?: string; type: string }>({
  items,
  renderPreview,
}: {
  items: T[]
  renderPreview: (item: T) => React.ReactNode
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No styles of this type.</p>
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((style) => (
        <Card key={style.id}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="truncate text-sm">{style.name}</CardTitle>
              <Badge variant="outline">{style.type}</Badge>
            </div>
            {style.description && (
              <p className="text-muted-foreground text-xs">{style.description}</p>
            )}
          </CardHeader>
          <CardContent>
            {renderPreview(style)}
            <RawJson data={style} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
