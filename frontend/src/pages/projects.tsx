import { useEffect, useMemo, useState } from "react"
import { useOutletContext, useSearchParams } from "react-router"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchInput } from "@/components/search-input"
import {
  ProjectsTable,
  ProjectFormDialog,
} from "@/features/projects/components/projects-table"
import type { AppLayoutContext } from "@/components/layout/app-layout"

export default function ProjectsPage() {
  const { data: projects, isLoading, refetch } = useOutletContext<AppLayoutContext>()
  const [query, setQuery] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Open the create dialog when arriving via /projects?create=1 (sidebar link).
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setCreateOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete("create")
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const filtered = useMemo(() => {
    const list = projects ?? []
    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter((p) => p.name.toLowerCase().includes(q))
  }, [projects, query])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New Project
        </Button>
      </div>

      <SearchInput value={query} onChange={setQuery} placeholder="Search projects…" />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <ProjectsTable
          projects={filtered}
          onRefetch={refetch}
          onCreate={() => setCreateOpen(true)}
        />
      )}

      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={refetch}
      />
    </div>
  )
}
