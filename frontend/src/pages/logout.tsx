import { useEffect } from "react"
import { useNavigate } from "react-router"
import { pb } from "@/lib/pocketbase"

export default function LogoutPage() {
  const navigate = useNavigate()
  useEffect(() => {
    pb.authStore.clear()
    navigate("/login", { replace: true })
  }, [navigate])
  return null
}
