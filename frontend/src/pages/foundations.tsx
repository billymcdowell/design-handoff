import { useState } from "react"
import { FoundationsWorkspace } from "@/features/foundations/components/foundations-workspace"
import { useSharedFoundations } from "@/hooks/data"
import { removeFoundationSource } from "@/lib/api"
import { isPocketBaseSuperuser } from "@/lib/auth"
import { pb } from "@/lib/pocketbase"
import type { User } from "@/lib/types"

function canEditFoundations(): boolean {
  const record = pb.authStore.record as User | null
  if (!record) return false
  if (isPocketBaseSuperuser(record)) return true
  return record.role === "designer"
}

export default function FoundationsPage() {
  const { data: foundation, isLoading, refetch } = useSharedFoundations()
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  if (isLoading) return <div className="p-8">Loading foundations…</div>

  if (!foundation) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold">Foundations</h1>
        <p className="text-muted-foreground">
          No foundations yet. Sync local variables &amp; styles from each Figma
          file in the plugin — one shared catalog for the whole organization
          (tokens keyed by Figma id so renames update in place).
        </p>
      </div>
    )
  }

  async function handleRemove(fileKey: string) {
    setRemovingKey(fileKey)
    setRemoveError(null)
    try {
      await removeFoundationSource(foundation!, fileKey)
      refetch()
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : String(err))
    } finally {
      setRemovingKey(null)
    }
  }

  return (
    <FoundationsWorkspace
      data={foundation.data}
      variablesCount={foundation.variables_count}
      stylesCount={foundation.styles_count}
      canRemove={canEditFoundations()}
      removingKey={removingKey}
      removeError={removeError}
      onRemove={(fileKey) => void handleRemove(fileKey)}
    />
  )
}
