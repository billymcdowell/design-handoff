import { useEffect, useState } from "react"
import { Link } from "react-router"
import { format } from "date-fns"
import { MoreVertical, FolderOpen } from "lucide-react"
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
  DialogDescription,
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
import { createUserProject, updateUserProject, deleteUserProject } from "@/lib/api"
import { projectThumbnailSrc } from "@/lib/files"
import { copyShareLink, projectShareUrl } from "@/lib/share"
import { toast } from "@/lib/toast"
import type { Project } from "@/lib/types"
import { useAuth } from "@/providers/auth-provider"

export function ProjectsTable({
  projects,
  onRefetch,
  onCreate,
}: {
  projects: Project[]
  onRefetch: () => void
  onCreate: () => void
}) {
  const { canManage } = useAuth()
  const [editing, setEditing] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)

  return (
    <>
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground mb-4 text-sm">
            {canManage
              ? "No projects found. Create your first project to get started."
              : "No projects yet. Ask a designer to create one."}
          </p>
          {canManage && <Button onClick={onCreate}>New Project</Button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              canManage={canManage}
              onEdit={() => setEditing(project)}
              onDelete={() => setDeleting(project)}
            />
          ))}
        </div>
      )}

      {canManage && (
        <>
          <ProjectFormDialog
            open={!!editing}
            project={editing ?? undefined}
            onOpenChange={(o) => !o && setEditing(null)}
            onSaved={onRefetch}
          />

          <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  All frames and layers will also be deleted. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async (e) => {
                    e.preventDefault()
                    if (!deleting) return
                    const ok = await deleteUserProject(deleting.id)
                    if (ok) {
                      toast.success("Project deleted")
                      setDeleting(null)
                      onRefetch()
                    } else {
                      toast.error("Failed to delete project")
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

function ProjectCard({
  project,
  canManage,
  onEdit,
  onDelete,
}: {
  project: Project
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const thumb = projectThumbnailSrc(project)
  return (
    <Card className="group overflow-hidden pt-0">
      <Link to={`/projects/${project.id}`} className="block">
        <div className="bg-muted flex aspect-video items-center justify-center overflow-hidden">
          {thumb ? (
            <img src={thumb} alt={project.name} className="h-full w-full object-cover" />
          ) : (
            <FolderOpen className="text-muted-foreground size-10" />
          )}
        </div>
      </Link>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="truncate text-base">
            <Link to={`/projects/${project.id}`} className="hover:underline">
              {project.name}
            </Link>
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Project actions">
                  <MoreVertical className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => void copyShareLink(projectShareUrl(project.id))}
              >
                Copy link
              </DropdownMenuItem>
              {canManage && (
                <>
                  <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardFooter className="text-muted-foreground flex items-center justify-between text-xs">
        <span>{project.frame_count ?? 0} frames</span>
        <span>{format(new Date(project.created), "MMM d, yyyy")}</span>
      </CardFooter>
    </Card>
  )
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  project?: Project
  onSaved: () => void
}) {
  const isEdit = !!project
  const [name, setName] = useState("")
  const [figmaUrl, setFigmaUrl] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(project?.name ?? "")
      setFigmaUrl(project?.figma_file_url ?? "")
    }
  }, [open, project])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      if (isEdit) {
        await updateUserProject({ id: project!.id, name: name.trim(), figma_file_url: figmaUrl.trim() || undefined })
        toast.success("Project updated")
      } else {
        await createUserProject({ name: name.trim(), figma_file_url: figmaUrl.trim() || undefined })
        toast.success("Project created")
      }
      onOpenChange(false)
      onSaved()
    } catch {
      toast.error(isEdit ? "Failed to update project" : "Failed to create project")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update the project details." : "Create a project to organize your frames."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My design system"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-figma">Figma file URL (optional)</Label>
              <Input
                id="project-figma"
                type="url"
                value={figmaUrl}
                onChange={(e) => setFigmaUrl(e.target.value)}
                placeholder="https://figma.com/file/…"
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
