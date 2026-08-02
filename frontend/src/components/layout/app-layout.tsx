import { Link, Outlet } from "react-router"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { AppSidebar } from "./app-sidebar"
import { ModeToggle } from "./mode-toggle"
import { CommandPalette } from "@/components/command-palette"
import { useProjects, type AsyncState } from "@/hooks/data"
import type { Project } from "@/lib/types"

export type AppLayoutContext = AsyncState<Project[]>

export function AppLayout() {
  const projectsState = useProjects()
  const projects = projectsState.data ?? []

  return (
    <SidebarProvider>
      <AppSidebar projects={projects} />
      <SidebarInset className="h-svh overflow-x-auto">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <Button variant="ghost" size="sm" render={<Link to="/logout" />}>
              Logout
            </Button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <Outlet context={projectsState satisfies AppLayoutContext} />
        </div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  )
}
