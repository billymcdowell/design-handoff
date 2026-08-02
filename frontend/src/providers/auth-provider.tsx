/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { refreshAuthSession } from "@/lib/auth"
import { pb } from "@/lib/pocketbase"
import { canManageContent, getUserRole } from "@/lib/permissions"
import type { User, UserRole } from "@/lib/types"

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  role: UserRole
  canManage: boolean
  logout: () => void
}

const AuthCtx = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  role: "developer",
  canManage: false,
  logout: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(pb.authStore.record as User | null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const unsub = pb.authStore.onChange((_token, record) => {
      setUser((record as User | null) ?? null)
    })

    async function hydrate() {
      try {
        if (pb.authStore.isValid) {
          await refreshAuthSession()
        }
      } catch {
        pb.authStore.clear()
      } finally {
        if (!cancelled) {
          setUser((pb.authStore.record as User | null) ?? null)
          setIsLoading(false)
        }
      }
    }

    void hydrate()
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const logout = () => {
    pb.authStore.clear()
  }

  const value = useMemo<AuthContextValue>(() => {
    const role = getUserRole(user)
    return {
      user,
      isLoading,
      role,
      canManage: canManageContent(user),
      logout,
    }
  }, [user, isLoading])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
