import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeft, Box, ExternalLink, X } from "lucide-react"
import { InspectorPanel } from "@/features/frames/components/inspector"
import {
  useComponentUsages,
  useLibraryComponent,
  useLibraryComponentVariants,
} from "@/hooks/data"
import { buildFigmaNodeUrl } from "@/lib/figma-url"
import {
  libraryComponentPreviewSrc,
  libraryComponentVariantPreviewSrc,
} from "@/lib/files"
import { transformVariantLayerInspect } from "@/lib/transforms"
import type {
  ComponentVariantLayer,
  LibraryComponentVariantRecord,
} from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

function findLayersAtPoint(
  frameX: number,
  frameY: number,
  layers: ComponentVariantLayer[],
): ComponentVariantLayer[] {
  return layers.filter((layer) => {
    const x = layer.x || 0
    const y = layer.y || 0
    const w = layer.width || 0
    const h = layer.height || 0
    return frameX >= x && frameX <= x + w && frameY >= y && frameY <= y + h
  })
}

function paintOrderedLayers(
  layers: ComponentVariantLayer[],
): ComponentVariantLayer[] {
  // Paint order: parents before children (same as frame flatten order).
  const byParent = new Map<string | undefined, ComponentVariantLayer[]>()
  for (const layer of layers) {
    const key = layer.parent
    const bucket = byParent.get(key)
    if (bucket) bucket.push(layer)
    else byParent.set(key, [layer])
  }
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  const out: ComponentVariantLayer[] = []
  const walk = (parentId: string | undefined) => {
    const children = byParent.get(parentId) ?? []
    for (const child of children) {
      out.push(child)
      walk(child.id)
    }
  }
  walk(undefined)
  // Orphans (parent missing from payload)
  for (const layer of layers) {
    if (!out.includes(layer)) out.push(layer)
  }
  return out
}

const MAX_PREVIEW = 520

function ComponentInspectCanvas({
  preview,
  alt,
  baseWidth,
  baseHeight,
  layers,
  selectedLayerId,
  hoveredLayerId,
  contextMenu,
  onCanvasClick,
  onContextMenu,
  onLayerClick,
  onHoverChange,
  onPickLayer,
  canvasRef,
}: {
  preview: string | undefined
  alt: string
  baseWidth: number
  baseHeight: number
  layers: ComponentVariantLayer[]
  selectedLayerId: string | null
  hoveredLayerId: string | null
  contextMenu: {
    x: number
    y: number
    layers: ComponentVariantLayer[]
  } | null
  onCanvasClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onLayerClick: (layer: ComponentVariantLayer, e: React.MouseEvent) => void
  onHoverChange: (id: string | null) => void
  onPickLayer: (id: string) => void
  canvasRef: React.RefObject<HTMLDivElement | null>
}) {
  const scale =
    baseWidth > 0 && baseHeight > 0
      ? Math.min(1, MAX_PREVIEW / Math.max(baseWidth, baseHeight))
      : 1

  return (
    <section
      ref={canvasRef}
      className="border bg-muted/20 relative flex min-h-[320px] items-center justify-center overflow-auto rounded-lg p-6"
      onClick={onCanvasClick}
      onContextMenu={onContextMenu}
    >
      {preview && baseWidth > 0 && baseHeight > 0 ? (
        <div
          className="relative shrink-0"
          style={{
            width: baseWidth * scale,
            height: baseHeight * scale,
          }}
        >
          <div
            data-component-transform
            className="absolute top-0 left-0 shadow-sm"
            style={{
              width: baseWidth,
              height: baseHeight,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <img
              src={preview}
              alt={alt}
              draggable={false}
              className="pointer-events-none block max-w-none select-none"
              style={{ width: baseWidth, height: baseHeight }}
            />
            {layers.map((layer) => {
              const isSelected = selectedLayerId === layer.id
              const isHovered = hoveredLayerId === layer.id
              return (
                <div
                  key={layer.id}
                  data-layer-overlay
                  className={`absolute transition-colors ${
                    isSelected
                      ? "bg-blue-500/10 ring-2 ring-blue-500"
                      : isHovered
                        ? "bg-blue-400/5 ring-2 ring-blue-400/50"
                        : "hover:bg-blue-400/5 hover:ring-2 hover:ring-blue-400/50"
                  } cursor-pointer`}
                  style={{
                    left: layer.x || 0,
                    top: layer.y || 0,
                    width: layer.width || 0,
                    height: layer.height || 0,
                  }}
                  onClick={(e) => onLayerClick(layer, e)}
                  onMouseEnter={() => onHoverChange(layer.id)}
                  onMouseLeave={() => onHoverChange(null)}
                  title={layer.name}
                />
              )
            })}
          </div>
        </div>
      ) : preview ? (
        <img
          src={preview}
          alt={alt}
          className="max-h-[480px] max-w-full object-contain"
        />
      ) : (
        <Box className="text-muted-foreground size-12 opacity-40" />
      )}

      {contextMenu && (
        <div
          className="bg-popover text-popover-foreground fixed z-50 min-w-40 rounded-md border p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.layers.map((layer) => (
            <button
              key={layer.id}
              type="button"
              className="hover:bg-muted flex w-full flex-col rounded px-2 py-1.5 text-left text-xs"
              onClick={() => onPickLayer(layer.id)}
            >
              <span className="font-medium">{layer.name}</span>
              <span className="text-muted-foreground font-mono">
                {layer.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default function ComponentDetailPage() {
  const { componentKey: rawKey } = useParams<{ componentKey: string }>()
  const componentKey = rawKey ? decodeURIComponent(rawKey) : undefined
  const { data: component, isLoading, error } = useLibraryComponent(componentKey)
  const { data: usages, isLoading: loadingUsages } =
    useComponentUsages(componentKey)
  const { data: variantRows, isLoading: loadingVariants } =
    useLibraryComponentVariants(component?.id)

  const [activeVariantKey, setActiveVariantKey] = useState<string | null>(null)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    layers: ComponentVariantLayer[]
  } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const variants = useMemo(() => {
    if (variantRows && variantRows.length > 0) return variantRows
    return [] as LibraryComponentVariantRecord[]
  }, [variantRows])

  const activeVariant = useMemo(() => {
    if (!variants.length) return undefined
    if (activeVariantKey) {
      return (
        variants.find((v) => v.key === activeVariantKey) ??
        variants.find((v) => v.is_default) ??
        variants[0]
      )
    }
    return variants.find((v) => v.is_default) ?? variants[0]
  }, [variants, activeVariantKey])

  // Clear selection when switching variants
  useEffect(() => {
    setSelectedLayerId(null)
    setHoveredLayerId(null)
    setContextMenu(null)
  }, [activeVariant?.id])

  const layers = useMemo(
    () => paintOrderedLayers(activeVariant?.layers ?? []),
    [activeVariant],
  )

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) ?? null,
    [layers, selectedLayerId],
  )

  const inspected = useMemo(() => {
    if (!selectedLayer || !activeVariant) return null
    const detail =
      activeVariant.layer_details?.[selectedLayer.id] ??
      activeVariant.layer_details?.[selectedLayer.figma_node_id ?? ""] ??
      null
    return transformVariantLayerInspect(selectedLayer, detail)
  }, [selectedLayer, activeVariant])

  const preview =
    (activeVariant
      ? libraryComponentVariantPreviewSrc(activeVariant)
      : undefined) ||
    (component ? libraryComponentPreviewSrc(component) : undefined)

  const baseWidth = activeVariant?.width || 0
  const baseHeight = activeVariant?.height || 0
  const tokens = component?.tokens_used ?? []

  const figmaFileUrl = component?.file_key
    ? `https://www.figma.com/design/${component.file_key}`
    : undefined

  const figmaUrl =
    (activeVariant?.figma_node_id || component?.figma_node_id) && figmaFileUrl
      ? buildFigmaNodeUrl(
          figmaFileUrl,
          activeVariant?.figma_node_id || component!.figma_node_id!,
        )
      : null

  // Fallback chips from slim JSON when variant rows aren't synced yet
  const fallbackVariants = component?.variants ?? []
  const chipVariants =
    variants.length > 0
      ? variants.map((v) => ({
          key: v.key,
          name: v.name,
          properties: v.properties ?? {},
        }))
      : fallbackVariants.map((v) => ({
          key: v.key,
          name: v.name,
          properties: v.properties ?? {},
        }))

  function handleCanvasClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-layer-overlay]")) return
    setSelectedLayerId(null)
    setContextMenu(null)
  }

  function handleLayerClick(layer: ComponentVariantLayer, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedLayerId(layer.id)
    setContextMenu(null)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (!canvasRef.current || !baseWidth || !baseHeight) return
    const transformEl = canvasRef.current.querySelector(
      "[data-component-transform]",
    ) as HTMLElement | null
    if (!transformEl) return
    const rect = transformEl.getBoundingClientRect()
    const scaleX = rect.width / baseWidth
    const scaleY = rect.height / baseHeight
    const frameX = (e.clientX - rect.left) / scaleX
    const frameY = (e.clientY - rect.top) / scaleY
    const hits = findLayersAtPoint(frameX, frameY, layers).reverse()
    if (hits.length === 0) {
      setContextMenu(null)
      return
    }
    setContextMenu({ x: e.clientX, y: e.clientY, layers: hits })
  }

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground text-sm">Loading component…</p>
      </div>
    )
  }

  if (error || !component) {
    return (
      <div className="flex flex-col gap-4 p-6 md:p-8">
        <Button variant="ghost" size="sm" render={<Link to="/components" />}>
          <ArrowLeft className="size-4" />
          Back to Components
        </Button>
        <p className="text-muted-foreground text-sm">
          Component not found. Sync it from Figma with Sync components.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          render={<Link to="/components" />}
        >
          <ArrowLeft className="size-4" />
          Back to Components
        </Button>

        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {component.name}
            </h1>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {component.kind === "COMPONENT_SET"
                  ? "Component set"
                  : "Component"}
              </Badge>
              <Badge variant="secondary">{component.file_name}</Badge>
              {component.page_name && (
                <Badge variant="outline">{component.page_name}</Badge>
              )}
              {component.hidden && <Badge variant="secondary">Hidden</Badge>}
              {component.updated && (
                <span className="text-muted-foreground self-center text-xs">
                  Synced{" "}
                  {new Date(component.updated).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              )}
            </div>
            {component.description && (
              <p className="text-muted-foreground max-w-2xl text-sm">
                {component.description}
              </p>
            )}
          </div>
          {figmaUrl && (
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={figmaUrl} target="_blank" rel="noreferrer" />
              }
            >
              Open in Figma
              <ExternalLink className="size-3.5" />
            </Button>
          )}
        </header>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {chipVariants.length > 1 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Variants</h2>
              <div className="flex flex-wrap gap-2">
                {chipVariants.map((variant) => {
                  const isActive =
                    (activeVariant?.key ?? chipVariants[0]?.key) === variant.key
                  return (
                    <button
                      key={variant.key}
                      type="button"
                      onClick={() => setActiveVariantKey(variant.key)}
                      className={`border rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? "border-foreground bg-foreground text-background"
                          : "hover:border-foreground/30 bg-background"
                      }`}
                    >
                      <span className="font-medium">{variant.name}</span>
                      {Object.keys(variant.properties).length > 0 && (
                        <span
                          className={
                            isActive ? "opacity-80" : "text-muted-foreground"
                          }
                        >
                          {" "}
                          ·{" "}
                          {Object.entries(variant.properties)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(", ")}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {loadingVariants && (
                <p className="text-muted-foreground text-xs">
                  Loading variant previews…
                </p>
              )}
              {!loadingVariants && variants.length === 0 && (
                <p className="text-muted-foreground text-xs">
                  Re-sync components from Figma to enable live variant previews
                  and click-to-inspect.
                </p>
              )}
            </section>
          )}

          <ComponentInspectCanvas
            preview={preview}
            alt={component.name}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
            layers={layers}
            selectedLayerId={selectedLayerId}
            hoveredLayerId={hoveredLayerId}
            contextMenu={contextMenu}
            onCanvasClick={handleCanvasClick}
            onContextMenu={handleContextMenu}
            onLayerClick={handleLayerClick}
            onHoverChange={setHoveredLayerId}
            onPickLayer={(id) => {
              setSelectedLayerId(id)
              setContextMenu(null)
            }}
            canvasRef={canvasRef}
          />

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Tokens used</h2>
            {tokens.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No bound variables or styles detected on this component.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {tokens.map((token) => (
                  <li key={token.id}>
                    <Link
                      to={`/foundations?token=${encodeURIComponent(token.id)}`}
                      className="border hover:border-foreground/30 inline-flex rounded-md px-2 py-1 text-xs transition-colors"
                    >
                      {token.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="border bg-background flex min-h-[280px] flex-col overflow-hidden rounded-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h2 className="text-sm font-medium">Inspector</h2>
            {selectedLayer && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setSelectedLayerId(null)}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
          <ScrollArea className="flex-1">
            {inspected ? (
              <InspectorPanel layer={inspected} figmaFileUrl={figmaFileUrl} />
            ) : (
              <p className="text-muted-foreground p-4 text-sm">
                Click a layer in the preview to inspect layout, styles, and
                code.
              </p>
            )}
          </ScrollArea>
        </aside>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Used in</h2>
        {loadingUsages && (
          <p className="text-muted-foreground text-sm">
            Scanning published screens…
          </p>
        )}
        {!loadingUsages && (!usages || usages.length === 0) && (
          <p className="text-muted-foreground text-sm">
            No usages found in published screens yet. Publish a screen that
            instances this component to see it here.
          </p>
        )}
        {usages && usages.length > 0 && (
          <ul className="divide-border border rounded-lg divide-y">
            {usages.map((usage) => (
              <li key={`${usage.frameId}-${usage.layerId}`}>
                <Link
                  to={`/frame/${usage.frameId}`}
                  className="hover:bg-muted/40 flex flex-col gap-0.5 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {usage.frameName}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {usage.layerName}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {usage.projectName}
                      {usage.pageName ? ` · ${usage.pageName}` : ""}
                    </p>
                  </div>
                  {usage.variantProperties &&
                    Object.keys(usage.variantProperties).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(usage.variantProperties).map(
                          ([k, v]) => (
                            <Badge
                              key={k}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {k}={v}
                            </Badge>
                          ),
                        )}
                      </div>
                    )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
