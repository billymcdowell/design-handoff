import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import {
  ArrowLeft,
  Check,
  Clock,
  Layers as LayersIcon,
  Link2,
  MessageSquarePlus,
  Minus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { FeedbackDialog } from "@/features/feedback/components/feedback-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
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
import { Inspector } from "./inspector"
import { deleteFrame, getLayerDetails } from "@/lib/api"
import { frameImageSrc } from "@/lib/files"
import { frameUploaderLabel } from "@/lib/frame-utils"
import { copyToClipboard } from "@/lib/clipboard"
import { copyShareLink, frameShareUrl } from "@/lib/share"
import { toast } from "@/lib/toast"
import { useIsMobile } from "@/hooks/use-mobile"
import type { Frame, Layer } from "@/lib/types"
import { useAuth } from "@/providers/auth-provider"

interface FrameViewerPageProps {
  frame: Frame & { layers: Layer[] }
  frameId: string
  projectId: string
  layerDetailsMap: Record<string, { padding?: { top: number; right: number; bottom: number; left: number } }>
  frameVersions: Frame[]
  allFrames: Frame[]
}

const ZOOM_MIN = 0.05
const ZOOM_MAX = 5
const ZOOM_STEP = 0.05

// ─── Geometry helpers (from spec) ───────────────────────────
function flattenLayers(layers: Layer[]): Layer[] {
  const layerMap = new Map<string, Layer & { children?: Layer[] }>()
  const rootLayers: (Layer & { children?: Layer[] })[] = []
  layers.forEach((layer) => layerMap.set(layer.id, { ...layer }))
  layers.forEach((layer) => {
    const node = layerMap.get(layer.id)!
    if (layer.parent) {
      const parent = layerMap.get(layer.parent)
      if (parent) {
        if (!parent.children) parent.children = []
        parent.children.push(node)
      } else {
        rootLayers.push(node)
      }
    } else {
      rootLayers.push(node)
    }
  })
  const flatten = (nodes: (Layer & { children?: Layer[] })[]): Layer[] =>
    nodes.reduce<Layer[]>((acc, n) => {
      acc.push(n)
      if (n.children) acc.push(...flatten(n.children))
      return acc
    }, [])
  return flatten(rootLayers)
}

function findLayersAtPoint(frameX: number, frameY: number, allLayers: Layer[]): Layer[] {
  return allLayers.filter((layer) => {
    const x = layer.x || 0
    const y = layer.y || 0
    const w = layer.width || 0
    const h = layer.height || 0
    return frameX >= x && frameX <= x + w && frameY >= y && frameY <= y + h
  })
}

function calculateDistance(layer1: Layer, layer2: Layer) {
  const x1 = layer1.x || 0,
    y1 = layer1.y || 0,
    w1 = layer1.width || 0,
    h1 = layer1.height || 0
  const right1 = x1 + w1,
    bottom1 = y1 + h1
  const x2 = layer2.x || 0,
    y2 = layer2.y || 0,
    w2 = layer2.width || 0,
    h2 = layer2.height || 0
  const right2 = x2 + w2,
    bottom2 = y2 + h2
  const gapX = Math.max(0, Math.max(x1, x2) - Math.min(right1, right2))
  const gapY = Math.max(0, Math.max(y1, y2) - Math.min(bottom1, bottom2))
  let point1X: number, point1Y: number, point2X: number, point2Y: number

  if (gapX === 0 && gapY === 0) {
    point1X = x1 + w1 / 2
    point1Y = y1 + h1 / 2
    point2X = x2 + w2 / 2
    point2Y = y2 + h2 / 2
  } else if (gapX === 0) {
    const centerX = (Math.min(right1, right2) + Math.max(x1, x2)) / 2
    if (y1 + h1 <= y2) {
      point1X = centerX
      point1Y = bottom1
      point2X = centerX
      point2Y = y2
    } else {
      point1X = centerX
      point1Y = y1
      point2X = centerX
      point2Y = bottom2
    }
  } else if (gapY === 0) {
    const centerY = (Math.min(bottom1, bottom2) + Math.max(y1, y2)) / 2
    if (x1 + w1 <= x2) {
      point1X = right1
      point1Y = centerY
      point2X = x2
      point2Y = centerY
    } else {
      point1X = x1
      point1Y = centerY
      point2X = right2
      point2Y = centerY
    }
  } else {
    let c1X: number, c1Y: number, c2X: number, c2Y: number
    if (x1 + w1 <= x2) {
      c1X = right1
      if (y1 + h1 <= y2) {
        c1Y = bottom1
        c2X = x2
        c2Y = y2
      } else {
        c1Y = y1
        c2X = x2
        c2Y = bottom2
      }
    } else {
      c1X = x1
      if (y1 + h1 <= y2) {
        c1Y = bottom1
        c2X = right2
        c2Y = y2
      } else {
        c1Y = y1
        c2X = right2
        c2Y = bottom2
      }
    }
    point1X = c1X
    point1Y = c1Y
    point2X = c2X
    point2Y = c2Y
  }
  const deltaX = point2X - point1X,
    deltaY = point2Y - point1Y
  return {
    distance: Math.round(Math.sqrt(deltaX * deltaX + deltaY * deltaY)),
    point1: { x: point1X, y: point1Y },
    point2: { x: point2X, y: point2Y },
  }
}

function formatDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function FrameViewerPage({
  frame,
  frameId,
  projectId,
  layerDetailsMap,
  frameVersions,
}: FrameViewerPageProps) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { canManage } = useAuth()

  const [selectedLayer, setSelectedLayer] = useState<Layer | null>(null)
  const [hoveredLayer, setHoveredLayer] = useState<Layer | null>(null)
  const [zoom, setZoom] = useState(1)
  const [showVersionTimeline, setShowVersionTimeline] = useState(false)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [overlappingLayers, setOverlappingLayers] = useState<Layer[]>([])
  const [menuHoveredLayerId, setMenuHoveredLayerId] = useState<string | null>(null)
  const [layerSearch, setLayerSearch] = useState("")
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ active: boolean; startX: number; startY: number; moved: boolean }>({
    active: false,
    startX: 0,
    startY: 0,
    moved: false,
  })

  const baseWidth = frame.width || 800
  const baseHeight = frame.height || 600

  const allLayers = useMemo(() => flattenLayers(frame.layers), [frame.layers])

  const visibleLayers = useMemo(() => {
    if (!layerSearch.trim()) return allLayers
    const q = layerSearch.toLowerCase()
    return allLayers.filter(
      (l) => l.name.toLowerCase().includes(q) || l.type.toLowerCase().includes(q)
    )
  }, [allLayers, layerSearch])

  const isOlderVersion = frameVersions.length > 1 && frameVersions[0]?.id !== frameId

  // Fit frame into the canvas once per frame. The transform node must keep its
  // design-pixel size (never flex-shrink) so layer overlays stay aligned with
  // the screenshot — scale only via the zoom transform.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    let fitted = false
    const ro = new ResizeObserver(() => {
      if (fitted || el.clientWidth === 0 || el.clientHeight === 0) return
      fitted = true
      const pad = 64
      const availW = Math.max(1, el.clientWidth - pad)
      const availH = Math.max(1, el.clientHeight - pad)
      const next = Math.min(1, availW / baseWidth, availH / baseHeight)
      setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(next * 100) / 100)))
      setPanX(0)
      setPanY(0)
      ro.disconnect()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [baseWidth, baseHeight, frameId])

  // Reset pan when zoom returns to 1.
  useEffect(() => {
    if (zoom === 1) {
      setPanX(0)
      setPanY(0)
    }
  }, [zoom])

  const handleZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))
  const handleZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))

  const handleLayerClick = (layer: Layer, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedLayer((prev) => (prev?.id === layer.id ? prev : layer))
  }

  const handleCanvasClick = () => {
    if (dragState.current.moved) return
    setSelectedLayer(null)
    setContextMenuOpen(false)
  }

  const handleLayerDoubleClick = async (layer: Layer, e: React.MouseEvent) => {
    e.stopPropagation()
    if (layer.type !== "TEXT") return
    let textToCopy = layer.name
    try {
      const details = await getLayerDetails(layer.id)
      const typography = details?.typography
      if (typography) {
        const characters =
          typography.characters || typography.text || typography.content || typography.value
        if (characters && typeof characters === "string" && characters.trim()) {
          if (!textToCopy || characters.length > textToCopy.length || characters !== textToCopy) {
            textToCopy = characters
          }
        }
      }
    } catch {
      /* fall back to layer.name */
    }
    if (textToCopy?.trim()) {
      const ok = await copyToClipboard(textToCopy.trim())
      ok ? toast.success("Text copied to clipboard") : toast.error("Failed to copy")
    }
  }

  const openLayerPickerAt = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return
    const transformEl = canvasRef.current.querySelector('[data-frame-transform]') as HTMLElement | null
    if (!transformEl) return
    const rect = transformEl.getBoundingClientRect()
    const frameX = (clientX - rect.left) / zoom
    const frameY = (clientY - rect.top) / zoom
    const hits = findLayersAtPoint(frameX, frameY, allLayers)
    if (hits.length > 0) {
      setOverlappingLayers([...hits].reverse())
      setContextMenuPosition({ x: clientX, y: clientY })
      setContextMenuOpen(true)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (dragState.current.moved) return
    openLayerPickerAt(e.clientX, e.clientY)
  }

  // Right-button drag to pan (only when zoomed in).
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 && zoom > 1) {
      dragState.current = { active: true, startX: e.clientX, startY: e.clientY, moved: false }
    }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current.active) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    if (!dragState.current.moved && Math.hypot(dx, dy) < 5) return
    dragState.current.moved = true
    setIsDragging(true)
    dragState.current.startX = e.clientX
    dragState.current.startY = e.clientY
    setPanX((p) => p + dx)
    setPanY((p) => p + dy)
  }
  const endDrag = () => {
    dragState.current.active = false
    setIsDragging(false)
    // clear the moved flag on the next tick so the click handler can read it
    requestAnimationFrame(() => (dragState.current.moved = false))
  }

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (zoom > 1) {
        e.preventDefault()
        setPanX((p) => p - e.deltaX)
        setPanY((p) => p - e.deltaY)
      }
    },
    [zoom]
  )

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    el.addEventListener("wheel", handleWheel, { passive: false })
    return () => el.removeEventListener("wheel", handleWheel)
  }, [handleWheel])

  const handleVersionSelect = (versionId: string) => {
    navigate(`/frame/${versionId}?projectId=${projectId}`)
    setShowVersionTimeline(false)
  }

  const confirmDeleteVersion = async () => {
    if (!deleteVersionId) return
    setDeleting(true)
    setDeleteError(null)
    const success = await deleteFrame(deleteVersionId)
    setDeleting(false)
    if (success) {
      const deletedId = deleteVersionId
      setDeleteVersionId(null)
      if (deletedId === frameId) navigate("/projects")
      else window.location.reload()
    } else {
      setDeleteError("Failed to delete frame. Please try again.")
    }
  }

  const distance =
    selectedLayer && hoveredLayer && selectedLayer.id !== hoveredLayer.id
      ? calculateDistance(selectedLayer, hoveredLayer)
      : null

  const hoveredPadding = hoveredLayer ? layerDetailsMap[hoveredLayer.id]?.padding : undefined
  const uploaderLabel = frameUploaderLabel(frame)

  return (
    <div className="flex h-svh flex-col">
      {/* Header */}
      <header className="bg-background sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to project"
          render={<Link to={`/projects/${projectId}`} />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <LayersIcon className="text-muted-foreground size-4" />
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium">{frame.name}</span>
          {uploaderLabel && (
            <span className="text-muted-foreground block truncate text-xs">
              Uploaded by {uploaderLabel}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFeedbackOpen(true)}
          >
            <MessageSquarePlus className="size-4" />
            Feedback
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void copyShareLink(frameShareUrl(frameId, projectId))}
          >
            <Link2 className="size-4" />
            Share
          </Button>
          {frameVersions.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setShowVersionTimeline((v) => !v)}>
              <Clock className="size-4" />
              Versions ({frameVersions.length})
            </Button>
          )}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={handleZoomOut} aria-label="Zoom out">
              <Minus className="size-4" />
            </Button>
            <span className="w-12 text-center font-mono text-xs tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="outline" size="icon" onClick={handleZoomIn} aria-label="Zoom in">
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Older-version banner */}
      {isOlderVersion && (
        <div className="bg-muted/50 flex items-center justify-between border-b px-4 py-2 text-sm">
          <span className="text-muted-foreground">You're viewing an older version</span>
          <Button size="sm" variant="secondary" onClick={() => handleVersionSelect(frameVersions[0].id)}>
            View Latest
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Version sidebar */}
        {showVersionTimeline && (
          <aside className="bg-background flex w-80 shrink-0 flex-col border-r">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Version History</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowVersionTimeline(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-2 p-3">
                {frameVersions.map((version, index) => {
                  const isCurrent = version.id === frameId
                  const isLatest = index === 0
                  const date = version.updated || version.created
                  const uploader = frameUploaderLabel(version)
                  return (
                    <div
                      key={version.id}
                      className={`rounded-lg border p-3 ${isCurrent ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        {isLatest && <Badge variant="secondary">Latest</Badge>}
                        {isCurrent && (
                          <span className="text-primary flex items-center gap-1 text-xs font-medium">
                            <Check className="size-3" /> Viewing
                          </span>
                        )}
                      </div>
                      {uploader && (
                        <p className="text-muted-foreground mb-0.5 truncate text-xs">
                          Uploaded by {uploader}
                        </p>
                      )}
                      <p className="text-muted-foreground mb-3 text-xs">{formatDate(date)}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          disabled={isCurrent}
                          onClick={() => handleVersionSelect(version.id)}
                        >
                          View
                        </Button>
                        {canManage && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete version"
                            onClick={() => setDeleteVersionId(version.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </aside>
        )}

        {/* Canvas */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <div className="relative w-full max-w-xs">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                className="h-8 pl-8 text-xs"
                placeholder="Filter layers…"
                value={layerSearch}
                onChange={(e) => setLayerSearch(e.target.value)}
              />
            </div>
            <span className="text-muted-foreground text-xs">
              {visibleLayers.length} / {allLayers.length} layers
            </span>
          </div>

          <div
            ref={canvasRef}
            className="bg-muted/30 relative flex-1 overflow-hidden"
            style={{ cursor: isDragging ? "grabbing" : "default" }}
            onClick={handleCanvasClick}
            onContextMenu={handleContextMenu}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
          >
            <div className="flex h-full w-full items-center justify-center p-8">
              {/* Outer box is the *visual* size so flex centering works at any zoom.
                  Inner box keeps design-pixel dimensions; scale is applied here. */}
              <div
                className="relative shrink-0"
                style={{
                  width: baseWidth * zoom,
                  height: baseHeight * zoom,
                }}
              >
                <div
                  data-frame-transform
                  className="absolute top-0 left-0 shadow-xl"
                  style={{
                    width: baseWidth,
                    height: baseHeight,
                    transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                    transformOrigin: "top left",
                  }}
                >
                  <img
                    src={frameImageSrc(frame)}
                    alt={frame.name}
                    draggable={false}
                    className="pointer-events-none block max-w-none select-none"
                    style={{ width: baseWidth, height: baseHeight }}
                  />

                  {/* Layer overlays */}
                  {visibleLayers.map((layer) => {
                    const isSelected = selectedLayer?.id === layer.id
                    const isMenuHovered = menuHoveredLayerId === layer.id
                    return (
                      <div
                        key={layer.id}
                        data-layer-overlay
                        className={`absolute transition-colors ${
                          isSelected
                            ? "bg-blue-500/10 ring-2 ring-blue-500"
                            : isMenuHovered
                              ? "bg-yellow-400/20 ring-2 ring-yellow-400"
                              : "hover:bg-blue-400/5 hover:ring-2 hover:ring-blue-400/50"
                        } ${layer.type === "TEXT" ? "cursor-text" : "cursor-pointer"}`}
                        style={{
                          left: layer.x || 0,
                          top: layer.y || 0,
                          width: layer.width || 0,
                          height: layer.height || 0,
                        }}
                        onClick={(e) => handleLayerClick(layer, e)}
                        onDoubleClick={(e) => handleLayerDoubleClick(layer, e)}
                        onMouseEnter={() => setHoveredLayer(layer)}
                        onMouseLeave={() => setHoveredLayer((h) => (h?.id === layer.id ? null : h))}
                        title={layer.type === "TEXT" ? "Double-click to copy text" : undefined}
                      />
                    )
                  })}

                  {/* Padding overlays for hovered layer */}
                  {hoveredLayer && hoveredPadding && (
                    <PaddingOverlay layer={hoveredLayer} padding={hoveredPadding} />
                  )}

                  {/* Distance measurement */}
                  {distance && (
                    <svg
                      className="pointer-events-none absolute inset-0 overflow-visible"
                      width={baseWidth}
                      height={baseHeight}
                    >
                      <line
                        x1={distance.point1.x}
                        y1={distance.point1.y}
                        x2={distance.point2.x}
                        y2={distance.point2.y}
                        stroke="#ef4444"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                        vectorEffect="non-scaling-stroke"
                      />
                      <g
                        transform={`translate(${(distance.point1.x + distance.point2.x) / 2}, ${
                          (distance.point1.y + distance.point2.y) / 2
                        }) scale(${1 / zoom})`}
                      >
                        <rect x={-16} y={-9} width={32} height={18} rx={4} fill="#ef4444" />
                        <text x={0} y={0} fill="white" fontSize={11} textAnchor="middle" dominantBaseline="central">
                          {distance.distance}px
                        </text>
                      </g>
                    </svg>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Inspector — desktop right sidebar */}
        {selectedLayer && !isMobile && (
          <aside className="bg-background flex w-80 shrink-0 flex-col border-l">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="truncate text-sm font-medium">{selectedLayer.name}</span>
              <Button variant="ghost" size="icon" onClick={() => setSelectedLayer(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <Inspector layerId={selectedLayer.id} />
            </ScrollArea>
          </aside>
        )}
      </div>

      {/* Inspector — mobile drawer */}
      {isMobile && (
        <Drawer open={!!selectedLayer} onOpenChange={(o) => !o && setSelectedLayer(null)}>
          <DrawerContent className="h-[70vh]">
            <DrawerHeader>
              <DrawerTitle>{selectedLayer?.name}</DrawerTitle>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-auto">
              {selectedLayer && <Inspector layerId={selectedLayer.id} />}
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Overlapping-layer picker */}
      {contextMenuOpen && contextMenuPosition && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenuOpen(false)} />
          <div
            className="bg-popover text-popover-foreground fixed z-50 max-h-64 w-56 overflow-auto rounded-lg border p-1 shadow-lg"
            style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
          >
            <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">Select Layer</div>
            {overlappingLayers.map((layer) => (
              <button
                key={layer.id}
                className="hover:bg-accent flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm"
                onMouseEnter={() => setMenuHoveredLayerId(layer.id)}
                onMouseLeave={() => setMenuHoveredLayerId(null)}
                onClick={() => {
                  setSelectedLayer(layer)
                  setContextMenuOpen(false)
                  setMenuHoveredLayerId(null)
                }}
              >
                <span className="truncate">{layer.name}</span>
                <span className="text-muted-foreground ml-2 shrink-0 text-xs">{layer.type}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Delete version confirm */}
      <AlertDialog open={!!deleteVersionId} onOpenChange={(o) => !o && setDeleteVersionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes this frame version and all of its layers. This cannot be undone.
              {deleteError && <span className="text-destructive mt-2 block">{deleteError}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDeleteVersion() }} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  )
}

function PaddingOverlay({
  layer,
  padding,
}: {
  layer: Layer
  padding: { top: number; right: number; bottom: number; left: number }
}) {
  const x = layer.x || 0
  const y = layer.y || 0
  const w = layer.width || 0
  const h = layer.height || 0
  const fill = "rgba(239,68,68,0.25)"
  return (
    <div className="pointer-events-none absolute" style={{ left: x, top: y, width: w, height: h }}>
      {padding.top > 0 && (
        <div className="absolute" style={{ left: 0, top: 0, width: "100%", height: padding.top, background: fill }} />
      )}
      {padding.bottom > 0 && (
        <div className="absolute" style={{ left: 0, bottom: 0, width: "100%", height: padding.bottom, background: fill }} />
      )}
      {padding.left > 0 && (
        <div className="absolute" style={{ left: 0, top: 0, width: padding.left, height: "100%", background: fill }} />
      )}
      {padding.right > 0 && (
        <div className="absolute" style={{ right: 0, top: 0, width: padding.right, height: "100%", background: fill }} />
      )}
    </div>
  )
}
