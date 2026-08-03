import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { useDraggable } from "@dnd-kit/core"
import { format } from "date-fns"
import { MoreVertical, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateFrame, deleteFrame } from "@/lib/api"
import { frameImageSrc } from "@/lib/files"
import { frameUploaderLabel } from "@/lib/frame-utils"
import { copyShareLink, frameShareUrl } from "@/lib/share"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/toast"
import type { Frame, Section } from "@/lib/types"
import { useAuth } from "@/providers/auth-provider"

export function FramesTable({
  frames,
  projectId,
  sections = [],
  onRefetch,
  emptyMessage = "No frames found for this project.",
  canSelect = false,
  selectedIds,
  onToggleSelect,
  onMoveToSection,
  draggingIds = [],
  enableDnd = false,
}: {
  frames: Frame[]
  projectId: string
  sections?: Section[]
  onRefetch: () => void
  emptyMessage?: string
  canSelect?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (frameId: string) => void
  onMoveToSection?: (frames: Frame[], sectionId: string | null) => void
  draggingIds?: string[]
  enableDnd?: boolean
}) {
  const navigate = useNavigate()
  const { canManage } = useAuth()
  const [editing, setEditing] = useState<Frame | null>(null)
  const [deleting, setDeleting] = useState<Frame | null>(null)

  if (frames.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {frames.map((frame) => {
          const selected = !!selectedIds?.has(frame.id)
          const multiSelected = selected && (selectedIds?.size ?? 0) > 1
          const isDragging = draggingIds.includes(frame.id)
          return (
            <FrameCard
              key={frame.id}
              frame={frame}
              projectId={projectId}
              sections={sections}
              canManage={canManage}
              canSelect={canSelect}
              selected={selected}
              multiSelected={multiSelected}
              selectedCount={selectedIds?.size ?? 0}
              enableDnd={enableDnd}
              isDragging={isDragging}
              onToggleSelect={onToggleSelect}
              onMoveToSection={onMoveToSection}
              onEdit={() => setEditing(frame)}
              onDelete={() => setDeleting(frame)}
              onView={() => navigate(`/frame/${frame.id}?projectId=${projectId}`)}
            />
          )
        })}
      </div>

      {canManage && (
        <>
          <FrameEditDialog
            frame={editing}
            onOpenChange={(o) => !o && setEditing(null)}
            onSaved={onRefetch}
          />

          <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This frame version and its layers will be permanently deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async (e) => {
                    e.preventDefault()
                    if (!deleting) return
                    const ok = await deleteFrame(deleting.id)
                    if (ok) {
                      toast.success("Frame deleted")
                      setDeleting(null)
                      onRefetch()
                    } else {
                      toast.error("Failed to delete frame")
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  )
}

function FrameCard(props: {
  frame: Frame
  projectId: string
  sections: Section[]
  canManage: boolean
  canSelect: boolean
  selected: boolean
  multiSelected: boolean
  selectedCount: number
  enableDnd: boolean
  isDragging: boolean
  onToggleSelect?: (frameId: string) => void
  onMoveToSection?: (frames: Frame[], sectionId: string | null) => void
  onEdit: () => void
  onDelete: () => void
  onView: () => void
}) {
  if (props.enableDnd) {
    return <DraggableFrameCard {...props} />
  }
  return <FrameCardView {...props} setNodeRef={undefined} dragProps={undefined} style={undefined} />
}

function DraggableFrameCard(props: {
  frame: Frame
  projectId: string
  sections: Section[]
  canManage: boolean
  canSelect: boolean
  selected: boolean
  multiSelected: boolean
  selectedCount: number
  enableDnd: boolean
  isDragging: boolean
  onToggleSelect?: (frameId: string) => void
  onMoveToSection?: (frames: Frame[], sectionId: string | null) => void
  onEdit: () => void
  onDelete: () => void
  onView: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging: isActiveDrag } = useDraggable({
    id: props.frame.id,
    data: { type: "frame", frameId: props.frame.id },
  })
  const suppressClickRef = useRef(false)

  useEffect(() => {
    if (isActiveDrag) suppressClickRef.current = true
  }, [isActiveDrag])

  return (
    <FrameCardView
      {...props}
      setNodeRef={setNodeRef}
      dragProps={{ ...listeners, ...attributes }}
      style={undefined}
      isDragging={props.isDragging || isActiveDrag}
      onView={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          return
        }
        props.onView()
      }}
    />
  )
}

function FrameCardView({
  frame,
  projectId,
  sections,
  canManage,
  canSelect,
  selected,
  multiSelected,
  selectedCount,
  enableDnd,
  isDragging,
  onToggleSelect,
  onMoveToSection,
  onEdit,
  onDelete,
  onView,
  setNodeRef,
  dragProps,
  style,
}: {
  frame: Frame
  projectId: string
  sections: Section[]
  canManage: boolean
  canSelect: boolean
  selected: boolean
  multiSelected: boolean
  selectedCount: number
  enableDnd: boolean
  isDragging: boolean
  onToggleSelect?: (frameId: string) => void
  onMoveToSection?: (frames: Frame[], sectionId: string | null) => void
  onEdit: () => void
  onDelete: () => void
  onView: () => void
  setNodeRef?: (node: HTMLElement | null) => void
  dragProps?: React.HTMLAttributes<HTMLElement>
  style?: React.CSSProperties
}) {
  return (
    <Card
      ref={setNodeRef}
      data-frame-card
      data-frame-id={frame.id}
      style={style}
      className={cn(
        "group relative overflow-hidden pt-0",
        selected && "ring-2 ring-primary",
        isDragging && "opacity-40",
      )}
    >
      {canSelect && onToggleSelect && (
        <div
          className="absolute top-2 left-2 z-10 cursor-default"
          data-no-marquee
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(frame.id)}
            aria-label={`Select ${frame.name}`}
            className="cursor-pointer bg-background/90 shadow-sm"
          />
        </div>
      )}

      <button
        type="button"
        className={cn(
          "bg-muted flex aspect-video w-full items-center justify-center overflow-hidden",
          enableDnd && "cursor-grab touch-none active:cursor-grabbing",
        )}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) {
            onToggleSelect?.(frame.id)
            return
          }
          onView()
        }}
        {...(dragProps ?? {})}
      >
        {frame.image || frame.image_url || frame.thumbnail || frame.thumbnail_url ? (
          <img
            src={frameImageSrc(frame)}
            alt={frame.name}
            className="pointer-events-none h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <ImageIcon className="text-muted-foreground size-10" />
        )}
      </button>

      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="truncate text-base">
            <button type="button" className="hover:underline" onClick={onView}>
              {frame.name}
            </button>
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Frame actions">
                  <MoreVertical className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onView}>View</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void copyShareLink(frameShareUrl(frame.id, projectId))}
              >
                Copy link
              </DropdownMenuItem>
              {canManage && (
                <>
                  <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
                  {sections.length > 0 && onMoveToSection && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        {multiSelected ? `Move ${selectedCount} to` : "Move to"}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => onMoveToSection([frame], null)}>
                          Ungrouped
                        </DropdownMenuItem>
                        {sections.map((section) => (
                          <DropdownMenuItem
                            key={section.id}
                            onClick={() => onMoveToSection([frame], section.id)}
                          >
                            {section.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardFooter className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span>
          {frame.width && frame.height
            ? `${Math.round(frame.width)}×${Math.round(frame.height)}`
            : "—"}
        </span>
        <span className="truncate text-right">
          {[
            frameUploaderLabel(frame),
            format(new Date(frame.updated || frame.created), "MMM d, yyyy"),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </CardFooter>
    </Card>
  )
}

/** Floating preview shown under the pointer while dragging. */
export function FrameDragPreview({ frame, count }: { frame: Frame; count: number }) {
  return (
    <div className="bg-card w-56 overflow-hidden rounded-xl border shadow-xl ring-1 ring-foreground/10">
      <div className="bg-muted relative aspect-video overflow-hidden">
        {frame.image || frame.image_url || frame.thumbnail || frame.thumbnail_url ? (
          <img
            src={frameImageSrc(frame)}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="text-muted-foreground size-8" />
          </div>
        )}
        {count > 1 && (
          <span className="bg-primary text-primary-foreground absolute top-2 right-2 rounded-md px-2 py-0.5 text-xs font-semibold shadow">
            {count}
          </span>
        )}
      </div>
      <div className="truncate px-3 py-2 text-sm font-medium">
        {count > 1 ? `${count} screens` : frame.name}
      </div>
    </div>
  )
}

function FrameEditDialog({
  frame,
  onOpenChange,
  onSaved,
}: {
  frame: Frame | null
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [figmaUrl, setFigmaUrl] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (frame) {
      setName(frame.name)
      setFigmaUrl(frame.figma_url ?? "")
    }
  }, [frame])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!frame || !name.trim()) return
    setSaving(true)
    try {
      await updateFrame({
        id: frame.id,
        name: name.trim(),
        figma_url: figmaUrl.trim() || undefined,
      })
      toast.success("Frame updated")
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error("Failed to update frame")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!frame} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit frame</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="frame-name">Name</Label>
              <Input
                id="frame-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="frame-figma">Figma URL (optional)</Label>
              <Input
                id="frame-figma"
                type="url"
                value={figmaUrl}
                onChange={(e) => setFigmaUrl(e.target.value)}
                placeholder="https://figma.com/file/…?node-id=…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
