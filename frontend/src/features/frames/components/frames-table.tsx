import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { format } from "date-fns"
import { MoreVertical, Image as ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { toast } from "@/lib/toast"
import type { Frame } from "@/lib/types"
import { useAuth } from "@/providers/auth-provider"

export function FramesTable({
  frames,
  projectId,
  onRefetch,
}: {
  frames: Frame[]
  projectId: string
  onRefetch: () => void
}) {
  const navigate = useNavigate()
  const { canManage } = useAuth()
  const [editing, setEditing] = useState<Frame | null>(null)
  const [deleting, setDeleting] = useState<Frame | null>(null)

  if (frames.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <p className="text-muted-foreground text-sm">No frames found for this project.</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {frames.map((frame) => (
          <Card key={frame.id} className="group overflow-hidden pt-0">
            <button
              className="bg-muted flex aspect-video w-full items-center justify-center overflow-hidden"
              onClick={() => navigate(`/frame/${frame.id}?projectId=${projectId}`)}
            >
              {frame.image || frame.image_url || frame.thumbnail || frame.thumbnail_url ? (
                <img src={frameImageSrc(frame)} alt={frame.name} className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="text-muted-foreground size-10" />
              )}
            </button>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="truncate text-base">
                  <button className="hover:underline" onClick={() => navigate(`/frame/${frame.id}?projectId=${projectId}`)}>
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
                    <DropdownMenuItem onClick={() => navigate(`/frame/${frame.id}?projectId=${projectId}`)}>
                      View
                    </DropdownMenuItem>
                    {canManage && (
                      <>
                        <DropdownMenuItem onClick={() => setEditing(frame)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleting(frame)}>
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
                {frame.width && frame.height ? `${Math.round(frame.width)}×${Math.round(frame.height)}` : "—"}
              </span>
              <span className="truncate text-right">
                {[frameUploaderLabel(frame), format(new Date(frame.updated || frame.created), "MMM d, yyyy")]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </CardFooter>
          </Card>
        ))}
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
      await updateFrame({ id: frame.id, name: name.trim(), figma_url: figmaUrl.trim() || undefined })
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
              <Input id="frame-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
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
