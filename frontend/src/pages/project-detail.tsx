import { useMemo, useState } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchInput } from "@/components/search-input"
import { FramesTable } from "@/features/frames/components/frames-table"
import { useProject, useProjectFrames } from "@/hooks/data"

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: project } = useProject(projectId)
  const { data: frames, isLoading, refetch } = useProjectFrames(projectId)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const list = frames ?? []
    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter((f) => f.name.toLowerCase().includes(q))
  }, [frames, query])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" render={<Link to="/projects" />}>
          <ArrowLeft className="size-4" />
          Projects
        </Button>
        <h1 className="text-2xl font-bold">{project?.name ?? "Project"}</h1>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Search frames…" />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <FramesTable frames={filtered} projectId={projectId!} onRefetch={refetch} />
      )}
    </div>
  )
}
