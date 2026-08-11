import { Link } from "react-router"
import { Box, ExternalLink } from "lucide-react"
import type { FrameComponentUsage } from "@/features/frames/frame-component-usage"
import { libraryComponentPreviewSrc } from "@/lib/files"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function FrameComponentsPanel({
  usages,
  selectedGroupKey,
  onSelect,
}: {
  usages: FrameComponentUsage[]
  selectedGroupKey: string | null
  onSelect: (usage: FrameComponentUsage | null) => void
}) {
  if (usages.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        No component instances found on this screen. Publish a screen that uses
        library components, or sync the component library.
      </p>
    )
  }

  return (
    <ul className="divide-border divide-y">
      {usages.map((usage) => {
        const selected = selectedGroupKey === usage.groupKey
        const preview = usage.libraryComponent
          ? libraryComponentPreviewSrc(usage.libraryComponent)
          : undefined

        return (
          <li key={usage.groupKey}>
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 transition-colors",
                selected ? "bg-primary/5" : "hover:bg-muted/40",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                onClick={() =>
                  onSelect(selected ? null : usage)
                }
              >
                <div className="bg-muted flex size-9 shrink-0 items-center justify-center overflow-hidden rounded border">
                  {preview ? (
                    <img
                      src={preview}
                      alt=""
                      className="size-full object-contain"
                    />
                  ) : (
                    <Box className="text-muted-foreground size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{usage.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {usage.count}×
                    </Badge>
                    {!usage.inLibrary && (
                      <Badge variant="outline" className="text-[10px]">
                        Not in library
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
              {usage.inLibrary && usage.catalogKey && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Open ${usage.name} in component catalog`}
                  render={
                    <Link
                      to={`/components/${encodeURIComponent(usage.catalogKey)}`}
                    />
                  }
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
