import { Navigate, Outlet, useLocation } from "react-router"
import { pb } from "@/lib/pocketbase"
import { useAuth } from "@/providers/auth-provider"

export function ProtectedRoute() {
  const { isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return null
  if (!pb.authStore.isValid) {
    const redirect = `${location.pathname}${location.search}${location.hash}`
    const search = new URLSearchParams({ redirect })
    return <Navigate to={`/login?${search.toString()}`} replace />
  }
  return <Outlet />
}
