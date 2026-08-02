import { FoundationsViewer } from "@/features/foundations/components/foundations-viewer"
import { useUserFoundations } from "@/hooks/data"

export default function FoundationsPage() {
  const { data: foundation, isLoading } = useUserFoundations()

  if (isLoading) return <div className="p-8">Loading foundations…</div>

  if (!foundation) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold">Foundations</h1>
        <p className="text-muted-foreground">
          No foundations yet. Publish variables & styles from the Figma plugin —
          they are shared across all of your projects.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Foundations</h1>
        <p className="text-muted-foreground text-sm">
          Shared across all projects · {foundation.variables_count} variables ·{" "}
          {foundation.styles_count} styles
        </p>
      </div>
      <FoundationsViewer data={foundation.data} />
    </div>
  )
}
