import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLocation } from "react-router"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { ChevronDown, MoreVertical, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FramesTable, FrameDragPreview } from "@/features/frames/components/frames-table"
import { useMarqueeSelect } from "@/hooks/use-marquee-select"
import { createSection, deleteSection, setScreensSection, updateSection } from "@/lib/api"
import {
  copyShareLink,
  sectionAnchorId,
  sectionIdFromHash,
  sectionShareUrl,
} from "@/lib/share"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/toast"
import type { Frame, Section } from "@/lib/types"
import { useAuth } from "@/providers/auth-provider"

const UNGROUPED_DROPPABLE = "section:ungrouped"

function droppableIdForSection(sectionId: string | null): string {
  return sectionId ? `section:${sectionId}` : UNGROUPED_DROPPABLE
}

function sectionIdFromDroppable(id: string | number): string | null | undefined {
  const value = String(id)
  if (!value.startsWith("section:")) return undefined
  const rest = value.slice("section:".length)
  return rest === "ungrouped" ? null : rest
}

const sectionCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  if (pointerHits.length > 0) return pointerHits
  return rectIntersection(args)
}

type FrameGroup = {
  id: string
  name: string
  sectionId: string | null
  section: Section | null
  frames: Frame[]
}

export function ProjectSectionsView({
  projectId,
  frames,
  sections,
  onRefetch,
}: {
  projectId: string
  frames: Frame[]
  sections: Section[]
  onRefetch: () => void
}) {
  const { canManage } = useAuth()
  const location = useLocation()
  const hashSectionId = sectionIdFromHash(location.hash)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Section | null>(null)
  const [deleting, setDeleting] = useState<Section | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null)
  const [draggingIds, setDraggingIds] = useState<string[]>([])
  const [moving, setMoving] = useState(false)
  const boardRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const frameById = useMemo(() => {
    const map = new Map<string, Frame>()
    for (const frame of frames) map.set(frame.id, frame)
    return map
  }, [frames])

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const next = new Set<string>()
      for (const id of prev) {
        if (frameById.has(id)) next.add(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [frameById])

  const groups = useMemo((): FrameGroup[] => {
    const bySection = new Map<string, Frame[]>()
    for (const section of sections) bySection.set(section.id, [])
    const ungrouped: Frame[] = []

    for (const frame of frames) {
      const sectionId = frame.section
      if (sectionId && bySection.has(sectionId)) {
        bySection.get(sectionId)!.push(frame)
      } else {
        ungrouped.push(frame)
      }
    }

    const ordered: FrameGroup[] = sections.map((section) => ({
      id: section.id,
      name: section.name,
      sectionId: section.id,
      section,
      frames: bySection.get(section.id) ?? [],
    }))

    if (sections.length === 0) {
      return [{ id: "all", name: "Screens", sectionId: null, section: null, frames: ungrouped }]
    }

    ordered.push({
      id: "ungrouped",
      name: "Ungrouped",
      sectionId: null,
      section: null,
      frames: ungrouped,
    })
    return ordered
  }, [frames, sections])

  const flatMode = sections.length === 0
  const canOrganize = canManage && sections.length > 0
  const selectedFrames = useMemo(
    () => frames.filter((f) => selectedIds.has(f.id)),
    [frames, selectedIds],
  )
  const activeFrame = activeFrameId ? frameById.get(activeFrameId) ?? null : null

  useEffect(() => {
    if (!hashSectionId || flatMode) return
    const el = document.getElementById(sectionAnchorId(hashSectionId))
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [hashSectionId, flatMode, groups])

  function toggleSelected(frameId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(frameId)) next.delete(frameId)
      else next.add(frameId)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  const handleMarqueeSelect = useCallback(
    (ids: string[], additive: boolean) => {
      setSelectedIds((prev) => {
        if (!additive) return new Set(ids)
        const next = new Set(prev)
        for (const id of ids) next.add(id)
        return next
      })
    },
    [],
  )

  const marquee = useMarqueeSelect({
    enabled: canOrganize && !activeFrameId && !moving,
    containerRef: boardRef,
    onSelect: handleMarqueeSelect,
  })

  function resolveMoveTargets(anchors: Frame[]): Frame[] {
    if (
      selectedFrames.length > 1 &&
      anchors.some((frame) => selectedIds.has(frame.id))
    ) {
      return selectedFrames
    }
    return anchors
  }

  async function moveFramesToSection(targets: Frame[], sectionId: string | null) {
    if (targets.length === 0 || moving) return
    setMoving(true)
    try {
      await setScreensSection(
        projectId,
        targets.map((f) => f.name),
        sectionId,
      )
      const label =
        sectionId == null
          ? "Ungrouped"
          : sections.find((s) => s.id === sectionId)?.name ?? "section"
      toast.success(
        targets.length === 1
          ? `Moved to ${label}`
          : `Moved ${targets.length} screens to ${label}`,
      )
      clearSelection()
      onRefetch()
    } catch {
      toast.error("Failed to move screens")
    } finally {
      setMoving(false)
    }
  }

  function handleMoveRequest(anchors: Frame[], sectionId: string | null) {
    void moveFramesToSection(resolveMoveTargets(anchors), sectionId)
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    setActiveFrameId(id)
    if (selectedIds.has(id) && selectedIds.size > 1) {
      setDraggingIds([...selectedIds])
    } else {
      setDraggingIds([id])
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { over } = event
    const ids = draggingIds
    setActiveFrameId(null)
    setDraggingIds([])
    if (!over || ids.length === 0) return

    const sectionId = sectionIdFromDroppable(over.id)
    if (sectionId === undefined) return

    const targets = ids.map((id) => frameById.get(id)).filter((f): f is Frame => !!f)
    if (targets.length === 0) return
    const alreadyThere = targets.every((f) => (f.section || null) === sectionId)
    if (alreadyThere) return
    void moveFramesToSection(targets, sectionId)
  }

  function handleDragCancel() {
    setActiveFrameId(null)
    setDraggingIds([])
  }

  const tableProps = {
    projectId,
    sections,
    onRefetch,
    canSelect: canOrganize,
    selectedIds,
    onToggleSelect: toggleSelected,
    onMoveToSection: handleMoveRequest,
    draggingIds,
    enableDnd: canOrganize,
  }

  const board = (
    <div
      ref={boardRef}
      data-no-marquee={marquee.isSelecting ? undefined : undefined}
      className={cn(
        "relative space-y-6 select-none",
        canOrganize && "cursor-default",
        marquee.isSelecting && "select-none",
      )}
      onPointerDown={canOrganize ? marquee.onPointerDown : undefined}
    >
      {flatMode ? (
        <FramesTable frames={frames} {...tableProps} enableDnd={false} />
      ) : (
        groups.map((group) => (
          <SectionGroup
            key={group.id}
            droppableId={droppableIdForSection(group.sectionId)}
            id={group.sectionId ? sectionAnchorId(group.sectionId) : undefined}
            title={group.name}
            count={group.frames.length}
            canManage={canManage && !!group.section}
            forceOpen={!!group.sectionId && group.sectionId === hashSectionId}
            onCopyLink={
              group.sectionId
                ? () => void copyShareLink(sectionShareUrl(projectId, group.sectionId!))
                : undefined
            }
            onEdit={group.section ? () => setEditing(group.section) : undefined}
            onDelete={group.section ? () => setDeleting(group.section) : undefined}
            isDragging={draggingIds.length > 0}
          >
            <FramesTable
              frames={group.frames}
              {...tableProps}
              emptyMessage={
                group.section
                  ? draggingIds.length > 0
                    ? "Drop screens here"
                    : "No screens in this section yet. Drag screens here or use Move to."
                  : draggingIds.length > 0
                    ? "Drop here to ungroup"
                    : "No ungrouped screens."
              }
            />
          </SectionGroup>
        ))
      )}

      {marquee.rect && marquee.rect.width + marquee.rect.height > 0 && (
        <div
          data-no-marquee
          className="pointer-events-none fixed z-50 border border-primary/60 bg-primary/10"
          style={{
            left: marquee.rect.left,
            top: marquee.rect.top,
            width: marquee.rect.width,
            height: marquee.rect.height,
          }}
        />
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2" data-no-marquee>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            New section
          </Button>
        )}
      </div>

      {canManage && selectedFrames.length > 0 && (
        <div
          data-no-marquee
          className="bg-muted/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
        >
          <span className="text-sm font-medium">{selectedFrames.length} selected</span>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            <X className="size-4" />
            Clear
          </Button>
          {sections.length > 0 && (
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button size="sm" variant="outline" aria-label="Selection actions">
                      <MoreVertical className="size-4" />
                      Actions
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        disabled={moving}
                        onClick={() => void moveFramesToSection(selectedFrames, null)}
                      >
                        Ungrouped
                      </DropdownMenuItem>
                      {sections.map((section) => (
                        <DropdownMenuItem
                          key={section.id}
                          disabled={moving}
                          onClick={() => void moveFramesToSection(selectedFrames, section.id)}
                        >
                          {section.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      )}

      {canOrganize ? (
        <DndContext
          sensors={sensors}
          collisionDetection={sectionCollision}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {board}
          <DragOverlay dropAnimation={null}>
            {activeFrame ? (
              <FrameDragPreview frame={activeFrame} count={draggingIds.length} />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        board
      )}

      {canManage && (
        <>
          <SectionFormDialog
            open={createOpen || !!editing}
            section={editing ?? undefined}
            projectId={projectId}
            nextSortOrder={sections.length}
            onOpenChange={(open) => {
              if (!open) {
                setCreateOpen(false)
                setEditing(null)
              }
            }}
            onSaved={onRefetch}
          />

          <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Screens in this section will become ungrouped. They will not be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async (e) => {
                    e.preventDefault()
                    if (!deleting) return
                    const ok = await deleteSection(deleting.id)
                    if (ok) {
                      toast.success("Section deleted")
                      setDeleting(null)
                      onRefetch()
                    } else {
                      toast.error("Failed to delete section")
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
    </div>
  )
}

function SectionGroup({
  droppableId,
  id,
  title,
  count,
  canManage,
  forceOpen = false,
  onCopyLink,
  isDragging,
  onEdit,
  onDelete,
  children,
}: {
  droppableId: string
  id?: string
  title: string
  count: number
  canManage: boolean
  forceOpen?: boolean
  onCopyLink?: () => void
  isDragging: boolean
  onEdit?: () => void
  onDelete?: () => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  const { setNodeRef, isOver } = useDroppable({ id: droppableId })
  const showMenu = canManage || !!onCopyLink

  useEffect(() => {
    if ((isOver || forceOpen) && !open) setOpen(true)
  }, [isOver, forceOpen, open])

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3">
      <div
        ref={setNodeRef}
        id={id}
        className={cn(
          "scroll-mt-6 rounded-xl transition-colors",
          isDragging && "ring-1 ring-dashed ring-border",
          isOver && "bg-primary/5 ring-2 ring-primary/40 ring-dashed",
        )}
      >
        <div className="flex items-center gap-2 px-1 pt-1" data-no-marquee>
          <CollapsibleTrigger className="hover:bg-muted -ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <ChevronDown
              className={`text-muted-foreground size-4 transition-transform ${open ? "" : "-rotate-90"}`}
            />
            <span>{title}</span>
            <span className="text-muted-foreground text-xs font-normal">({count})</span>
          </CollapsibleTrigger>
          {showMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Section actions">
                    <MoreVertical className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="start">
                {onCopyLink && (
                  <DropdownMenuItem onClick={onCopyLink}>Copy link</DropdownMenuItem>
                )}
                {canManage && (
                  <>
                    <DropdownMenuItem onClick={onEdit}>Rename</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={onDelete}>
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <CollapsibleContent className="px-1 pb-1 pt-2">{children}</CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function SectionFormDialog({
  open,
  section,
  projectId,
  nextSortOrder,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  section?: Section
  projectId: string
  nextSortOrder: number
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const isEdit = !!section

  useEffect(() => {
    if (open) setName(section?.name ?? "")
  }, [open, section])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      if (isEdit && section) {
        await updateSection({ id: section.id, name: name.trim() })
        toast.success("Section renamed")
      } else {
        await createSection({
          project: projectId,
          name: name.trim(),
          sort_order: nextSortOrder,
        })
        toast.success("Section created")
      }
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error(isEdit ? "Failed to rename section" : "Failed to create section")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Rename section" : "New section"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="section-name">Name</Label>
              <Input
                id="section-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Onboarding"
                required
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
