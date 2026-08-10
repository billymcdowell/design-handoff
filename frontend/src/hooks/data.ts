import { useCallback, useEffect, useRef, useState } from "react"
import {
  getUserProjects,
  getUserProjectById,
  getProjectFrames,
  getProjectSections,
  getFrame,
  getLayersByFrame,
  getFramesByName,
  getLayerPaddingMap,
  getLayer,
  getLayerDetails,
  getSharedFoundations,
  getSharedComponentLibrary,
  listLibraryComponents,
  getLibraryComponentByKey,
  listLibraryComponentVariants,
  findComponentUsages,
} from "@/lib/api"
import { sortFramesByDateDesc, dedupeLatestFrames } from "@/lib/frame-utils"
import type {
  ComponentLibrary,
  Foundation,
  Frame,
  Layer,
  LayerDetail,
  LibraryComponent,
  LibraryComponentVariantRecord,
  Project,
  Section,
} from "@/lib/types"

export interface AsyncState<T> {
  data: T | undefined
  isLoading: boolean
  error: unknown
  refetch: () => void
}

/**
 * Minimal data-fetching hook over the PocketBase SDK (no react-query).
 * Re-runs whenever `key` changes; ignores stale resolutions.
 */
function useAsync<T>(fn: () => Promise<T>, key: string, enabled = true): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<unknown>(undefined)
  const [nonce, setNonce] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      return
    }
    let active = true
    setIsLoading(true)
    setError(undefined)
    fnRef
      .current()
      .then((result) => {
        if (active) {
          setData(result)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!active) return
        // PocketBase auto-cancels duplicate in-flight requests. Same-hook
        // supersedes already set active=false in cleanup; a cross-hook cancel
        // still has active=true — retry so we don't spin forever.
        const isAbort = !!(err && typeof err === "object" && "isAbort" in err && err.isAbort)
        if (isAbort) {
          fnRef
            .current()
            .then((result) => {
              if (active) {
                setData(result)
                setIsLoading(false)
              }
            })
            .catch((retryErr) => {
              if (!active) return
              const retryAbort =
                !!(retryErr && typeof retryErr === "object" && "isAbort" in retryErr && retryErr.isAbort)
              if (!retryAbort) setError(retryErr)
              setIsLoading(false)
            })
          return
        }
        setError(err)
        setIsLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, nonce])

  return { data, isLoading, error, refetch }
}

export function useProjects() {
  return useAsync<Project[]>(getUserProjects, "projects")
}

export function useProject(projectId?: string) {
  return useAsync<Project>(() => getUserProjectById(projectId!), `project:${projectId}`, !!projectId)
}

export function useProjectFrames(projectId?: string) {
  return useAsync<Frame[]>(() => getProjectFrames(projectId!), `frames:${projectId}`, !!projectId)
}

export function useFrame(frameId?: string) {
  return useAsync<Frame | null>(() => getFrame(frameId!), `frame:${frameId}`, !!frameId)
}

export function useLayers(frameId?: string) {
  return useAsync<Layer[]>(() => getLayersByFrame(frameId!), `layers:${frameId}`, !!frameId)
}

export function useFrameVersions(projectId?: string, frameName?: string) {
  return useAsync<Frame[]>(
    async () => sortFramesByDateDesc(await getFramesByName(projectId!, frameName!)),
    `frame-versions:${projectId}:${frameName}`,
    !!projectId && !!frameName
  )
}

export function useLatestFramesByProject(projectId?: string) {
  return useAsync<Frame[]>(
    async () => dedupeLatestFrames(await getProjectFrames(projectId!)),
    `frames-latest:${projectId}`,
    !!projectId
  )
}

export function useProjectSections(projectId?: string) {
  return useAsync<Section[]>(
    () => getProjectSections(projectId!),
    `sections:${projectId}`,
    !!projectId,
  )
}

export function useLayerPaddingMap(layerIds: string[]) {
  return useAsync(
    () => getLayerPaddingMap(layerIds),
    `layer-padding:${layerIds.join(",")}`,
    layerIds.length > 0
  )
}

export function useLayerInspector(layerId?: string) {
  return useAsync<{ layer: Layer | null; detail: LayerDetail | null }>(
    async () => {
      const [layer, detail] = await Promise.all([getLayer(layerId!), getLayerDetails(layerId!)])
      return { layer, detail }
    },
    `layer-inspector:${layerId}`,
    !!layerId
  )
}

export function useSharedFoundations(enabled = true) {
  return useAsync<Foundation | null>(
    () => getSharedFoundations(),
    "foundations",
    enabled,
  )
}

export function useSharedComponentLibrary(enabled = true) {
  return useAsync<ComponentLibrary | null>(
    () => getSharedComponentLibrary(),
    "component-libraries",
    enabled,
  )
}

export function useLibraryComponents(enabled = true) {
  return useAsync<LibraryComponent[]>(
    () => listLibraryComponents(),
    "library-components",
    enabled,
  )
}

export function useLibraryComponent(key: string | undefined) {
  return useAsync<LibraryComponent | null>(
    () => getLibraryComponentByKey(key!),
    `library-component:${key}`,
    !!key,
  )
}

export function useLibraryComponentVariants(componentId: string | undefined) {
  return useAsync<LibraryComponentVariantRecord[]>(
    () => listLibraryComponentVariants(componentId!),
    `library-component-variants:${componentId}`,
    !!componentId,
  )
}

export function useComponentUsages(key: string | undefined) {
  return useAsync(
    () => findComponentUsages(key!),
    `component-usages:${key}`,
    !!key,
  )
}
