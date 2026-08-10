import { useMemo, useState } from "react"
import { Copy, Check, ExternalLink } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useLayerInspector } from "@/hooks/data"
import { transformLayerDetail, type TransformedLayerDetail } from "@/lib/transforms"
import { copyToClipboard } from "@/lib/clipboard"
import { buildFigmaNodeUrl } from "@/lib/figma-url"

export function Inspector({
  layerId,
  figmaFileUrl,
}: {
  layerId: string
  /** Project or frame Figma URL used to build layer deep links. */
  figmaFileUrl?: string
}) {
  const { data, isLoading } = useLayerInspector(layerId)
  const layer = useMemo(
    () => (data?.layer ? transformLayerDetail(data.layer, data.detail) : null),
    [data]
  )

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (!layer) return null

  const layerFigmaUrl = buildFigmaNodeUrl(figmaFileUrl, layer.figmaNodeId)

  return (
    <div className="w-full min-w-0">
      <div className="space-y-2 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{layer.name}</p>
            <p className="text-muted-foreground truncate font-mono text-xs">{layer.type}</p>
          </div>
          {layerFigmaUrl && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              render={
                <a href={layerFigmaUrl} target="_blank" rel="noopener noreferrer" />
              }
            >
              <ExternalLink className="size-3.5" />
              Figma
            </Button>
          )}
        </div>
        {layer.component && <ComponentSummary component={layer.component} />}
      </div>

      <Tabs defaultValue="layout" className="w-full min-w-0">
        <TabsList className="border-border h-10 w-full justify-start overflow-x-auto rounded-none border-b bg-transparent px-4">
          <TabsTrigger value="layout" className="shrink-0 text-xs">
            Layout
          </TabsTrigger>
          <TabsTrigger value="style" className="shrink-0 text-xs">
            Style
          </TabsTrigger>
          {layer.typography && (
            <TabsTrigger value="typography" className="shrink-0 text-xs">
              Type
            </TabsTrigger>
          )}
          <TabsTrigger value="code" className="shrink-0 text-xs">
            Code
          </TabsTrigger>
        </TabsList>
        <TabsContent value="layout" className="mt-0 space-y-4 p-4">
          <LayoutTab layer={layer} />
        </TabsContent>
        <TabsContent value="style" className="mt-0 space-y-4 p-4">
          <StyleTab layer={layer} />
        </TabsContent>
        {layer.typography && (
          <TabsContent value="typography" className="mt-0 space-y-4 p-4">
            <TypographyTab typography={layer.typography} />
          </TabsContent>
        )}
        <TabsContent value="code" className="mt-0 space-y-4 p-4">
          <CodeTab code={layer.code} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ComponentSummary({
  component,
}: {
  component: NonNullable<TransformedLayerDetail["component"]>
}) {
  const title =
    component.componentSetName ||
    component.mainComponentName ||
    component.name
  const variants = component.variantProperties
    ? Object.entries(component.variantProperties)
    : []

  return (
    <div className="bg-muted/50 space-y-1.5 rounded-md px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">Component</span>
        <span className="font-mono text-xs">{component.kind}</span>
      </div>
      <p className="truncate text-sm font-medium">{title}</p>
      {component.mainComponentName &&
        component.mainComponentName !== title && (
          <p className="text-muted-foreground truncate text-xs">
            {component.mainComponentName}
          </p>
        )}
      {variants.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {variants.map(([key, value]) => (
            <span
              key={key}
              className="bg-background text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px]"
            >
              {key}={value}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function LayoutTab({ layer }: { layer: TransformedLayerDetail }) {
  const auto = layer.layout.autoLayout
  const constraints = layer.layout.constraints
  return (
    <div className="space-y-4">
      <Section title="Position">
        <div className="grid grid-cols-2 gap-2">
          <PropertyItem label="X" value={`${layer.layout.position.x}px`} />
          <PropertyItem label="Y" value={`${layer.layout.position.y}px`} />
        </div>
      </Section>
      <Section title="Dimensions">
        <div className="grid grid-cols-2 gap-2">
          <PropertyItem label="W" value={`${layer.layout.dimensions.width}px`} />
          <PropertyItem label="H" value={`${layer.layout.dimensions.height}px`} />
        </div>
      </Section>
      {auto && (
        <Section title="Auto Layout">
          <div className="space-y-2">
            <PropertyItem label="Mode" value={auto.mode} />
            {auto.direction && (
              <PropertyItem label="Direction" value={auto.direction} />
            )}
            {auto.gap && <PropertyItem label="Gap" value={auto.gap} />}
            {auto.justifyContent && (
              <PropertyItem label="Justify" value={auto.justifyContent} />
            )}
            {auto.alignItems && (
              <PropertyItem label="Align" value={auto.alignItems} />
            )}
            {auto.wrap && <PropertyItem label="Wrap" value={auto.wrap} />}
            {(auto.sizingHorizontal || auto.sizingVertical) && (
              <div className="grid grid-cols-2 gap-2">
                {auto.sizingHorizontal && (
                  <PropertyItem label="H sizing" value={auto.sizingHorizontal} />
                )}
                {auto.sizingVertical && (
                  <PropertyItem label="V sizing" value={auto.sizingVertical} />
                )}
              </div>
            )}
          </div>
        </Section>
      )}
      {constraints && (
        <Section title="Constraints">
          <div className="grid grid-cols-2 gap-2">
            <PropertyItem label="Horizontal" value={constraints.horizontal} />
            <PropertyItem label="Vertical" value={constraints.vertical} />
          </div>
        </Section>
      )}
      {layer.layout.padding && (
        <Section title="Padding">
          <div className="grid grid-cols-4 gap-2">
            <PropertyItem label="T" value={`${layer.layout.padding.top}`} />
            <PropertyItem label="R" value={`${layer.layout.padding.right}`} />
            <PropertyItem label="B" value={`${layer.layout.padding.bottom}`} />
            <PropertyItem label="L" value={`${layer.layout.padding.left}`} />
          </div>
        </Section>
      )}
      {layer.layout.margin && (
        <Section title="Margin">
          <div className="grid grid-cols-4 gap-2">
            <PropertyItem label="T" value={`${layer.layout.margin.top}`} />
            <PropertyItem label="R" value={`${layer.layout.margin.right}`} />
            <PropertyItem label="B" value={`${layer.layout.margin.bottom}`} />
            <PropertyItem label="L" value={`${layer.layout.margin.left}`} />
          </div>
        </Section>
      )}
    </div>
  )
}

function StyleTab({ layer }: { layer: TransformedLayerDetail }) {
  return (
    <div className="space-y-4">
      {layer.styles.backgroundColor && (
        <Section title="Background">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div
                className="border-border h-8 w-8 rounded border"
                style={{ backgroundColor: layer.styles.backgroundColor }}
              />
              <span className="font-mono text-sm">{layer.styles.backgroundColor}</span>
            </div>
            {layer.styles.backgroundColorToken && (
              <TokenLabel label="Variable" name={layer.styles.backgroundColorToken.name} />
            )}
          </div>
        </Section>
      )}
      {layer.styles.borderRadius && layer.styles.borderRadius !== "0px" && (
        <PropertyItem label="Border Radius" value={layer.styles.borderRadius} />
      )}
      {layer.styles.borderWidth && layer.styles.borderWidth !== "0px" && (
        <div className="space-y-2">
          <PropertyItem label="Border Width" value={layer.styles.borderWidth} />
          {layer.styles.borderColor && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Color</span>
                <div
                  className="border-border h-4 w-4 rounded border"
                  style={{ backgroundColor: layer.styles.borderColor }}
                />
                <span className="font-mono text-sm">{layer.styles.borderColor}</span>
              </div>
              {layer.styles.borderColorToken && (
                <TokenLabel label="Variable" name={layer.styles.borderColorToken.name} />
              )}
            </div>
          )}
        </div>
      )}
      {layer.styles.effects && layer.styles.effects.length > 0 ? (
        <Section title="Effects">
          <div className="space-y-3">
            {layer.styles.effectStyle && (
              <TokenLabel label="Effect Style" name={layer.styles.effectStyle.name} />
            )}
            {layer.styles.effects.map((effect, index) => (
              <div key={`${effect.type}-${index}`} className="space-y-2">
                <h5 className="text-sm font-medium">{effect.name}</h5>
                {effect.properties.length > 0 && (
                  <div className="space-y-1.5">
                    {effect.properties.map((prop) =>
                      prop.label === "Color" || prop.label === "Secondary" ? (
                        <div
                          key={prop.label}
                          className="bg-muted/50 flex items-center justify-between rounded-md px-3 py-2"
                        >
                          <span className="text-muted-foreground text-xs">{prop.label}</span>
                          <div className="flex items-center gap-2">
                            <div
                              className="border-border h-4 w-4 rounded border"
                              style={{ backgroundColor: prop.value }}
                            />
                            <span className="font-mono text-sm">{prop.value}</span>
                          </div>
                        </div>
                      ) : (
                        <PropertyItem key={prop.label} label={prop.label} value={prop.value} />
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <>
          {layer.styles.boxShadow && (
            <div className="space-y-2">
              <PropertyItem label="Drop shadow" value={layer.styles.boxShadow} />
              {layer.styles.effectStyle && (
                <TokenLabel label="Effect Style" name={layer.styles.effectStyle.name} />
              )}
            </div>
          )}
          {!layer.styles.boxShadow && layer.styles.effectStyle && (
            <TokenLabel label="Effect Style" name={layer.styles.effectStyle.name} />
          )}
        </>
      )}
      {layer.styles.opacity !== undefined && layer.styles.opacity !== 1 && (
        <PropertyItem label="Opacity" value={`${layer.styles.opacity * 100}%`} />
      )}
    </div>
  )
}

function TypographyTab({
  typography,
}: {
  typography: NonNullable<TransformedLayerDetail["typography"]>
}) {
  return (
    <div className="space-y-4">
      {typography.textStyle && (
        <TokenLabel label="Text Style" name={typography.textStyle.name} />
      )}
      {typography.characters && (
        <Section title="Content">
          <div className="bg-muted/50 rounded-md px-3 py-2">
            <p className="text-sm whitespace-pre-wrap break-words">{typography.characters}</p>
          </div>
        </Section>
      )}
      <PropertyItem label="Font Family" value={typography.fontFamily} />
      <div className="grid grid-cols-2 gap-2">
        <PropertyItem label="Size" value={typography.fontSize} />
        <PropertyItem label="Weight" value={String(typography.fontWeight)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PropertyItem label="Line Height" value={typography.lineHeight} />
        <PropertyItem label="Letter Spacing" value={typography.letterSpacing} />
      </div>
      <Section title="Color">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div
              className="border-border h-6 w-6 rounded border"
              style={{ backgroundColor: typography.color }}
            />
            <span className="font-mono text-sm">{typography.color}</span>
          </div>
          {typography.colorToken && (
            <TokenLabel label="Variable" name={typography.colorToken.name} />
          )}
        </div>
      </Section>
      <PropertyItem label="Text Align" value={typography.textAlign} />
      {typography.textDecoration && typography.textDecoration !== "none" && (
        <PropertyItem label="Decoration" value={typography.textDecoration} />
      )}
      {typography.textTransform && typography.textTransform !== "none" && (
        <PropertyItem label="Transform" value={typography.textTransform} />
      )}
    </div>
  )
}

function CodeTab({ code }: { code: TransformedLayerDetail["code"] }) {
  const [copied, setCopied] = useState<string | null>(null)
  const handleCopy = async (text: string, type: string) => {
    if (await copyToClipboard(text)) {
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    }
  }
  return (
    <div className="space-y-4">
      <CodeBlock label="CSS" code={code.css} copied={copied === "css"} onCopy={() => handleCopy(code.css, "css")} />
      <CodeBlock
        label="Tailwind"
        code={code.tailwind}
        copied={copied === "tailwind"}
        onCopy={() => handleCopy(code.tailwind, "tailwind")}
      />
      <CodeBlock
        label="React (inline)"
        code={code.react}
        copied={copied === "react"}
        onCopy={() => handleCopy(code.react, "react")}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-muted-foreground mb-2 text-xs font-medium">{title}</h4>
      {children}
    </div>
  )
}

function PropertyItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 flex items-center justify-between rounded-md px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-mono text-sm">{value || "—"}</span>
    </div>
  )
}

function TokenLabel({ label, name }: { label: string; name: string }) {
  return (
    <div className="bg-muted/50 flex items-center justify-between gap-2 rounded-md px-3 py-2">
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
      <span className="font-mono text-sm break-all text-right">{name}</span>
    </div>
  )
}

function CodeBlock({
  label,
  code,
  copied,
  onCopy,
}: {
  label: string
  code: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-muted-foreground text-xs font-medium">{label}</h4>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onCopy} disabled={!code}>
          {copied ? (
            <>
              <Check className="size-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3" />
              Copy
            </>
          )}
        </Button>
      </div>
      <pre className="bg-muted max-w-full overflow-x-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
        {code || "—"}
      </pre>
    </div>
  )
}
