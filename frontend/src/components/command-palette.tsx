import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { Folder, Frame as FrameIcon } from "lucide-react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { pb } from "@/lib/pocketbase"
import { escapeFilterValue } from "@/lib/pb-filter"

type Result = {
  type: "project" | "frame"
  id: string
  name: string
  projectId?: string
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Result[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  useEffect(() => {
    if (!query || !pb.authStore.isValid) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const q = escapeFilterValue(query)
        const [projects, frames] = await Promise.all([
          pb.collection("projects").getList(1, 5, { filter: `name ~ "${q}"` }),
          pb.collection("frames").getList(1, 10, { filter: `name ~ "${q}"` }),
        ])
        setResults([
          ...projects.items.map((p) => ({ type: "project" as const, id: p.id, name: p.name })),
          ...frames.items.map((f) => ({
            type: "frame" as const,
            id: f.id,
            name: f.name,
            projectId: f.project,
          })),
        ])
      } catch {
        setResults([])
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const go = (r: Result) => {
    setOpen(false)
    if (r.type === "project") navigate(`/projects/${r.id}`)
    else navigate(`/frame/${r.id}?projectId=${r.projectId}`)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search projects and frames…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>{query ? "No results." : "Type to search…"}</CommandEmpty>
          {results.some((r) => r.type === "project") && (
            <CommandGroup heading="Projects">
              {results
                .filter((r) => r.type === "project")
                .map((r) => (
                  <CommandItem key={`project-${r.id}`} value={`project-${r.id}`} onSelect={() => go(r)}>
                    <Folder className="size-4" />
                    {r.name}
                  </CommandItem>
                ))}
            </CommandGroup>
          )}
          {results.some((r) => r.type === "frame") && (
            <CommandGroup heading="Frames">
              {results
                .filter((r) => r.type === "frame")
                .map((r) => (
                  <CommandItem key={`frame-${r.id}`} value={`frame-${r.id}`} onSelect={() => go(r)}>
                    <FrameIcon className="size-4" />
                    {r.name}
                  </CommandItem>
                ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
