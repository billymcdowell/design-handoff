import { useParams, useSearchParams } from "react-router"
import FrameViewerPage from "@/features/frames/components/frame-viewer-page"
import {
  useFrame,
  useLayers,
  useFrameVersions,
  useLatestFramesByProject,
  useLayerPaddingMap,
} from "@/hooks/data"

export default function FrameViewerRoute() {
  const { frameId } = useParams<{ frameId: string }>()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get("projectId") ?? ""

  const { data: frame, isLoading: frameLoading } = useFrame(frameId)
  const { data: layers = [] } = useLayers(frameId)
  const { data: frameVersions = [] } = useFrameVersions(projectId, frame?.name)
  const { data: allFrames = [] } = useLatestFramesByProject(projectId)
  const layerIds = (layers ?? []).map((l) => l.id)
  const { data: layerDetailsMap = {} } = useLayerPaddingMap(layerIds)

  if (frameLoading) return <div className="text-muted-foreground p-8">Loading frame…</div>
  if (!frame) return <div className="text-muted-foreground p-8">Frame not found</div>

  return (
    <FrameViewerPage
      frame={{ ...frame, layers: layers ?? [] }}
      frameId={frameId!}
      projectId={projectId}
      layerDetailsMap={layerDetailsMap ?? {}}
      frameVersions={frameVersions ?? []}
      allFrames={allFrames ?? []}
    />
  )
}
