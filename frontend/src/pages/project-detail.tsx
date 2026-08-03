import { useMemo, useState } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeft, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchInput } from "@/components/search-input"
import { ProjectSectionsView } from "@/features/frames/components/project-sections"
import { useProject, useLatestFramesByProject, useProjectSections } from "@/hooks/data"
import { copyShareLink, projectShareUrl } from "@/lib/share"

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: project } = useProject(projectId)
  const { data: frames, isLoading: framesLoading, refetch: refetchFrames } = useLatestFramesByProject(projectId)
  const { data: sections, isLoading: sectionsLoading, refetch: refetchSections } = useProjectSections(projectId)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const list = frames ?? []
    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter((f) => f.name.toLowerCase().includes(q))
  }, [frames, query])

  function refetch() {
    refetchFrames()
    refetchSections()
  }

  const isLoading = framesLoading || sectionsLoading

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" render={<Link to="/projects" />}>
          <ArrowLeft className="size-4" />
          Projects
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{project?.name ?? "Project"}</h1>
          {projectId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copyShareLink(projectShareUrl(projectId))}
            >
              <Link2 className="size-4" />
              Share
            </Button>
          )}
        </div>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Search frames…" />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <ProjectSectionsView
          projectId={projectId!}
          frames={filtered}
          sections={sections ?? []}
          onRefetch={refetch}
        />
      )}
    </div>
  )
}
