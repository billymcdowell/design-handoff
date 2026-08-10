import { useState } from "react"
import { Link, useLocation } from "react-router"
import { Component, Folder, Layers, MessageSquarePlus, Palette, Plus } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { FeedbackDialog } from "@/features/feedback/components/feedback-dialog"
import type { Project } from "@/lib/types"
import { useAuth } from "@/providers/auth-provider"

export function AppSidebar({ projects }: { projects: Project[] }) {
  const { pathname } = useLocation()
  const { canManage } = useAuth()
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Layers className="size-5" />
          <span className="font-semibold">Design Handoff</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {canManage ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to="/projects?create=1" />}
                    isActive={pathname === "/projects"}
                  >
                    <Plus />
                    <span>New Project</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to="/projects" />}
                    isActive={pathname === "/projects"}
                  >
                    <Folder />
                    <span>Projects</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to="/foundations" />}
                  isActive={pathname === "/foundations"}
                >
                  <Palette />
                  <span>Foundations</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to="/components" />}
                  isActive={pathname.startsWith("/components")}
                >
                  <Component />
                  <span>Components</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>
                    <span className="text-muted-foreground text-xs">No projects yet</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                projects.map((p) => (
                  <SidebarMenuItem key={p.id}>
                    <SidebarMenuButton
                      render={<Link to={`/projects/${p.id}`} />}
                      isActive={pathname === `/projects/${p.id}`}
                    >
                      <Folder className="size-4" />
                      <span>{p.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setFeedbackOpen(true)}>
              <MessageSquarePlus />
              <span>Send feedback</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </Sidebar>
  )
}
