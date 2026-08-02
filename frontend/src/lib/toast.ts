import { toast as toastManager } from "@/components/ui/toast"

// Thin sonner-style wrapper over the base-ui toast manager so call sites can
// use `toast.success(...)` / `toast.error(...)`.
export const toast = {
  success(title: string, description?: string) {
    return toastManager.add({ title, description, type: "success" })
  },
  error(title: string, description?: string) {
    return toastManager.add({ title, description, type: "error" })
  },
  info(title: string, description?: string) {
    return toastManager.add({ title, description, type: "info" })
  },
  message(title: string, description?: string) {
    return toastManager.add({ title, description })
  },
}
