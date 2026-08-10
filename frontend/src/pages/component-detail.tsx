import { useMemo, useState } from "react"
import { Link, useParams } from "react-router"
import { ArrowLeft, Box, ExternalLink } from "lucide-react"
import { useComponentUsages, useLibraryComponent } from "@/hooks/data"
import { buildFigmaNodeUrl } from "@/lib/figma-url"
import { libraryComponentPreviewSrc } from "@/lib/files"
import type { LibraryComponentVariant } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default function ComponentDetailPage() {
  const { componentKey: rawKey } = useParams<{ componentKey: string }>()
  const componentKey = rawKey ? decodeURIComponent(rawKey) : undefined
  const { data: component, isLoading, error } = useLibraryComponent(componentKey)
  const { data: usages, isLoading: loadingUsages } =
    useComponentUsages(componentKey)

  const variants = component?.variants ?? []
  const [activeVariantKey, setActiveVariantKey] = useState<string | null>(null)

  const activeVariant: LibraryComponentVariant | undefined = useMemo(() => {
    if (!variants.length) return undefined
    if (activeVariantKey) {
      return variants.find((v) => v.key === activeVariantKey) ?? variants[0]
    }
    return variants[0]
  }, [variants, activeVariantKey])

  const preview = component ? libraryComponentPreviewSrc(component) : undefined
  const tokens = component?.tokens_used ?? []

  const figmaUrl =
    component?.figma_node_id && component.file_key
      ? buildFigmaNodeUrl(
          `https://www.figma.com/design/${component.file_key}`,
          component.figma_node_id,
        )
      : null

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground text-sm">Loading component…</p>
      </div>
    )
  }

  if (error || !component) {
    return (
      <div className="flex flex-col gap-4 p-6 md:p-8">
        <Button variant="ghost" size="sm" render={<Link to="/components" />}>
          <ArrowLeft className="size-4" />
          Back to Components
        </Button>
        <p className="text-muted-foreground text-sm">
          Component not found. Sync it from Figma with Sync components.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit" render={<Link to="/components" />}>
          <ArrowLeft className="size-4" />
          Back to Components
        </Button>

        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {component.name}
            </h1>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {component.kind === "COMPONENT_SET" ? "Component set" : "Component"}
              </Badge>
              <Badge variant="secondary">{component.file_name}</Badge>
              {component.updated && (
                <span className="text-muted-foreground text-xs self-center">
                  Synced{" "}
                  {new Date(component.updated).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              )}
            </div>
            {component.description && (
              <p className="text-muted-foreground max-w-2xl text-sm">
                {component.description}
              </p>
            )}
          </div>
          {figmaUrl && (
            <Button variant="outline" size="sm" render={<a href={figmaUrl} target="_blank" rel="noreferrer" />}>
              Open in Figma
              <ExternalLink className="size-3.5" />
            </Button>
          )}
        </header>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="border bg-muted/20 flex min-h-[280px] items-center justify-center rounded-lg p-6">
          {preview ? (
            <img
              src={preview}
              alt={component.name}
              className="max-h-[480px] max-w-full object-contain"
            />
          ) : (
            <Box className="text-muted-foreground size-12 opacity-40" />
          )}
        </section>

        <div className="flex flex-col gap-6">
          {variants.length > 1 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Variants</h2>
              <div className="flex flex-wrap gap-2">
                {variants.map((variant) => {
                  const active = activeVariant?.key === variant.key
                  return (
                    <button
                      key={variant.key}
                      type="button"
                      onClick={() => setActiveVariantKey(variant.key)}
                      className={`border rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "hover:border-foreground/30 bg-background"
                      }`}
                    >
                      <span className="font-medium">{variant.name}</span>
                      {Object.keys(variant.properties).length > 0 && (
                        <span className={active ? "opacity-80" : "text-muted-foreground"}>
                          {" "}
                          ·{" "}
                          {Object.entries(variant.properties)
                            .map(([k, v]) => `${k}=${v}`)
                            .join(", ")}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-muted-foreground text-xs">
                Preview shows the default variant export. Variant chips list
                properties from Figma.
              </p>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Tokens used</h2>
            {tokens.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No bound variables or styles detected on this component.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {tokens.map((token) => (
                  <li key={token.id}>
                    <Link
                      to={`/foundations?token=${encodeURIComponent(token.id)}`}
                      className="border hover:border-foreground/30 inline-flex rounded-md px-2 py-1 text-xs transition-colors"
                    >
                      {token.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Used in</h2>
        {loadingUsages && (
          <p className="text-muted-foreground text-sm">Scanning published screens…</p>
        )}
        {!loadingUsages && (!usages || usages.length === 0) && (
          <p className="text-muted-foreground text-sm">
            No usages found in published screens yet. Publish a screen that
            instances this component to see it here.
          </p>
        )}
        {usages && usages.length > 0 && (
          <ul className="divide-border border rounded-lg divide-y">
            {usages.map((usage) => (
              <li key={`${usage.frameId}-${usage.layerId}`}>
                <Link
                  to={`/frame/${usage.frameId}`}
                  className="hover:bg-muted/40 flex flex-col gap-0.5 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {usage.frameName}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {usage.layerName}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {usage.projectName}
                      {usage.pageName ? ` · ${usage.pageName}` : ""}
                    </p>
                  </div>
                  {usage.variantProperties &&
                    Object.keys(usage.variantProperties).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(usage.variantProperties).map(
                          ([k, v]) => (
                            <Badge
                              key={k}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {k}={v}
                            </Badge>
                          ),
                        )}
                      </div>
                    )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
