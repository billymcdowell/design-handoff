import { BrowserRouter, Routes, Route, Navigate } from "react-router"
import { AuthProvider } from "@/providers/auth-provider"
import { ProtectedRoute } from "@/components/protected-route"
import { AppLayout } from "@/components/layout/app-layout"
import LoginPage from "@/pages/login"
import LogoutPage from "@/pages/logout"
import ProjectsPage from "@/pages/projects"
import ProjectDetailPage from "@/pages/project-detail"
import FoundationsPage from "@/pages/foundations"
import FrameViewerRoute from "@/pages/frame-viewer"

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/logout" element={<LogoutPage />} />
          <Route element={<ProtectedRoute />}>
            {/* Frame viewer is full-screen — outside the sidebar shell. */}
            <Route path="/frame/:frameId" element={<FrameViewerRoute />} />
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/projects" replace />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
              <Route path="/foundations" element={<FoundationsPage />} />
              {/* Legacy per-project URL → shared foundations */}
              <Route
                path="/projects/:projectId/foundations"
                element={<Navigate to="/foundations" replace />}
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
