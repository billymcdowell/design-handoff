/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react"
import type { RecordModel } from "pocketbase"
import { pb } from "@/lib/pocketbase"

type AuthContextValue = {
  user: RecordModel | null
  isLoading: boolean
  logout: () => void
}

const AuthCtx = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  logout: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<RecordModel | null>(pb.authStore.record)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setUser(pb.authStore.record)
    setIsLoading(false)
    // onChange returns an unsubscribe fn.
    return pb.authStore.onChange((_token, record) => setUser(record))
  }, [])

  const logout = () => {
    pb.authStore.clear()
  }

  return <AuthCtx.Provider value={{ user, isLoading, logout }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
