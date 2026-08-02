import { Navigate, Outlet } from "react-router"
import { pb } from "@/lib/pocketbase"
import { useAuth } from "@/providers/auth-provider"

export function ProtectedRoute() {
  const { isLoading } = useAuth()
  if (isLoading) return null
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  return <Outlet />
}
