import { useEffect, useRef, useState } from "react"
import type {
  BackendPayload,
  Project,
  UploadProgress,
} from "../types"

// ── UI → Main helper ─────────────────────────────────────────────────────────
function post(message: Record<string, unknown>) {
  parent.postMessage({ pluginMessage: message }, "*")
}

export function App() {
  // 7.1 — state
  const [token, setToken] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectionCount, setSelectionCount] = useState(0)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [inputToken, setInputToken] = useState("")
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  )
  const [startTime, setStartTime] = useState<number | null>(null)
  const [foundationsNote, setFoundationsNote] = useState<string | null>(null)

  // Refs so the (stable) message handler reads the latest values.
  const tokenRef = useRef<string | null>(null)
  const loadingRef = useRef(true)
  const isAuthenticatingRef = useRef(false)
  tokenRef.current = token
  loadingRef.current = loading
  isAuthenticatingRef.current = isAuthenticating

  // 7.2 — mount lifecycle
  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage
      if (!msg) return
      handleMessage(msg)
    }
    post({ type: "CHECK_AUTH" })
    return () => {
      window.onmessage = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleMessage(msg: Record<string, unknown>) {
    switch (msg.type) {
      case "SELECTION_CHANGED":
        setSelectionCount(msg.count as number)
        break

      case "AUTH_RESULT": {
        const newToken = (msg.token as string | null) ?? null
        setIsAuthenticating(false)
        if (newToken) {
          setToken(newToken)
          setDisplayName((msg.displayName as string | undefined) || "User")
          setLoading(false)
          setAuthError(null)
          setInputToken("")
          setLoadingProjects(true)
          setTimeout(() => post({ type: "FETCH_PROJECTS", token: newToken }), 100)
        } else {
          const errMsg = msg.error as string | undefined
          if (errMsg) setAuthError(errMsg)
          else if (!loadingRef.current && isAuthenticatingRef.current) {
            setAuthError("Invalid API key. Please check your key and try again.")
          }
          setToken(null)
          setDisplayName(null)
          setLoading(false)
          setSelectedProjectId("")
          setProjects([])
        }
        break
      }

      case "PROJECTS_LOADED": {
        const loaded = msg.projects as Project[]
        setProjects(loaded)
        setLoadingProjects(false)
        if (loaded.length === 1) setSelectedProjectId(loaded[0].id)
        break
      }

      case "PROJECTS_ERROR":
        setLoadingProjects(false)
        post({
          type: "NOTIFY",
          message:
            "❌ Failed to load projects. Please check your API key and try again.",
        })
        break

      case "UPLOAD_PROGRESS":
        setUploadProgress({
          current: msg.current as number,
          total: msg.total as number,
          currentItemName: msg.currentItemName as string,
          status: (msg.status as UploadProgress["status"]) ?? "processing",
        })
        break

      case "DATA_READY_FOR_UPLOAD":
        uploadData(msg.payload as BackendPayload)
        break

      case "UPLOAD_COMPLETE": {
        const success = msg.success as boolean
        setIsPublishing(false)
        setUploadProgress((prev) => ({
          current: prev?.total ?? 1,
          total: prev?.total ?? 1,
          currentItemName: "",
          status: success ? "complete" : "error",
          apiCallCount: msg.apiCallCount as number | undefined,
          ...(success ? {} : { error: msg.error }),
        }))
        break
      }

      case "PUBLISH_COMPLETE":
        if (!(msg.success as boolean)) {
          setIsPublishing(false)
          setUploadProgress(null)
        }
        break

      case "FOUNDATIONAL_DATA_READY_FOR_UPLOAD":
        post({
          type: "UPLOAD_FOUNDATIONAL_DATA",
          data: msg.data,
          token: tokenRef.current,
        })
        break

      case "FOUNDATIONAL_UPLOAD_COMPLETE": {
        setIsExporting(false)
        if (msg.success as boolean) {
          const fileName = (msg.fileName as string | undefined) || "this file"
          const changeLabel =
            (msg.changeLabel as string | undefined) || "no changes"
          setFoundationsNote(
            `Synced “${fileName}” (${changeLabel}). Other Figma files’ slices are kept.`,
          )
        } else {
          setFoundationsNote(null)
        }
        break
      }

      default:
        break
    }
  }

  // 15 — UI uploadData
  function uploadData(payload: BackendPayload) {
    const t = tokenRef.current
    if (!t) {
      post({ type: "NOTIFY", message: "❌ Not authenticated" })
      return
    }
    setStartTime(Date.now())
    let layerCount = 0
    for (const frame of Object.values(payload.frames)) {
      layerCount += countLayers(frame.layers)
    }
    setUploadProgress({
      current: 0,
      total: 1 + payload.projectFrames.frames.length + layerCount,
      currentItemName: "Preparing upload...",
      status: "uploading",
    })
    post({ type: "UPLOAD_DATA", payload, token: t })
  }

  // ── Computed (7.6) ──────────────────────────────────────────────────────────
  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const framesUsed = selectedProject?.frameCount ?? 0

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function handleLogin() {
    const trimmed = inputToken.trim()
    if (trimmed.length > 5) {
      setIsAuthenticating(true)
      setAuthError(null)
      // Main thread validates via PocketBase auth-refresh (see main.ts LOGIN).
      post({ type: "LOGIN", token: trimmed })
    } else {
      post({
        type: "NOTIFY",
        message: "❌ Please enter a valid API key or token",
      })
    }
  }

  function handlePublish() {
    if (!selectedProjectId) {
      post({ type: "NOTIFY", message: "❌ Please select a project first" })
      return
    }
    setIsPublishing(true)
    setStartTime(Date.now())
    setUploadProgress({
      current: 0,
      total: 100,
      currentItemName: "Processing design...",
      status: "processing",
    })
    post({ type: "PUBLISH", projectId: selectedProjectId })
  }

  function handleExportFoundational() {
    setIsExporting(true)
    setFoundationsNote(null)
    post({ type: "EXPORT_FOUNDATIONAL" })
  }

  function handleLogout() {
    post({ type: "LOGOUT" })
    setToken(null)
    setDisplayName(null)
    setProjects([])
    setSelectedProjectId("")
    setUploadProgress(null)
    setIsPublishing(false)
    setIsExporting(false)
    setAuthError(null)
    setInputToken("")
    setFoundationsNote(null)
  }

  // ── View routing (7.3) ──────────────────────────────────────────────────────
  if (loading) return <LoadingView />
  if (!token)
    return (
      <LoginView
        inputToken={inputToken}
        setInputToken={setInputToken}
        onLogin={handleLogin}
        isAuthenticating={isAuthenticating}
        authError={authError}
      />
    )
  if (uploadProgress !== null)
    return <ProgressView progress={uploadProgress} startTime={startTime} onDone={() => setUploadProgress(null)} />

  return (
    <DashboardView
      projects={projects}
      loadingProjects={loadingProjects}
      selectedProjectId={selectedProjectId}
      setSelectedProjectId={setSelectedProjectId}
      selectionCount={selectionCount}
      framesUsed={framesUsed}
      displayName={displayName || "User"}
      isPublishing={isPublishing}
      isExporting={isExporting}
      foundationsNote={foundationsNote}
      onPublish={handlePublish}
      onExportFoundational={handleExportFoundational}
      onLogout={handleLogout}
    />
  )
}

// ─── Views ───────────────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="view">
      <p>Loading...</p>
    </div>
  )
}

function LoginView(props: {
  inputToken: string
  setInputToken: (v: string) => void
  onLogin: () => void
  isAuthenticating: boolean
  authError: string | null
}) {
  const { inputToken, setInputToken, onLogin, isAuthenticating, authError } =
    props
  const disabled = inputToken.trim().length <= 5 || isAuthenticating
  return (
    <div className="view">
      <h1>Design Handoff</h1>
      <p>
        Paste a PocketBase auth token. For local setup, use a superuser
        impersonate token from the PocketBase Admin UI.
      </p>
      <div>
        <label htmlFor="apikey">PocketBase token</label>
        <input
          id="apikey"
          type="password"
          placeholder="Paste your token here"
          value={inputToken}
          onChange={(e) => setInputToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onLogin()
          }}
        />
      </div>
      {authError && <div className="error small">{authError}</div>}
      <button className="primary" disabled={disabled} onClick={onLogin}>
        {isAuthenticating ? "Validating..." : "Connect Account"}
      </button>
      <div className="spacer" />
      <p className="small">
        Admin → Collections → _superusers → your account → Impersonate → copy
        token. PocketBase must be running at localhost:8090.
      </p>
    </div>
  )
}

function DashboardView(props: {
  projects: Project[]
  loadingProjects: boolean
  selectedProjectId: string
  setSelectedProjectId: (v: string) => void
  selectionCount: number
  framesUsed: number
  displayName: string
  isPublishing: boolean
  isExporting: boolean
  foundationsNote: string | null
  onPublish: () => void
  onExportFoundational: () => void
  onLogout: () => void
}) {
  const {
    projects,
    loadingProjects,
    selectedProjectId,
    setSelectedProjectId,
    selectionCount,
    framesUsed,
    displayName,
    isPublishing,
    isExporting,
    foundationsNote,
    onPublish,
    onExportFoundational,
    onLogout,
  } = props

  const publishDisabled =
    selectionCount === 0 || !selectedProjectId || isPublishing
  const foundationalDisabled = isExporting

  return (
    <div className="view">
      <div className="row between">
        <h1>Design Handoff Project</h1>
        <span className="badge">Beta</span>
      </div>

      <div>
        <label htmlFor="project">Select Project</label>
        {loadingProjects ? (
          <p className="small">Loading projects...</p>
        ) : projects.length === 0 ? (
          <p className="small">
            No projects available. Create one in the dashboard first.
          </p>
        ) : (
          <select
            id="project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            <option value="">-- Choose a project --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {selectedProjectId && (
          <p className="small muted" style={{ marginTop: 6 }}>
            Frames on this project: {framesUsed}
          </p>
        )}
      </div>

      <div className="card center">
        {selectionCount === 0 ? (
          <p className="small">Select a frame to publish</p>
        ) : (
          <p className="small">{selectionCount} frame(s) selected</p>
        )}
      </div>

      <button className="primary" disabled={publishDisabled} onClick={onPublish}>
        {isPublishing ? "Processing..." : "Publish to Dev Handoff"}
      </button>
      <button disabled={foundationalDisabled} onClick={onExportFoundational}>
        {isExporting ? "Syncing foundations..." : "Sync foundations"}
      </button>
      <p className="small muted">
        Mirrors this Figma file’s local variables &amp; styles into your shared
        foundations. Sync other files separately — each file keeps its own
        slice.
      </p>
      {foundationsNote && <p className="small">{foundationsNote}</p>}

      <div className="spacer" />
      <div className="row between small muted">
        <span title={displayName}>Logged in as {displayName}</span>
        <button className="linkbtn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  )
}

function ProgressView(props: {
  progress: UploadProgress
  startTime: number | null
  onDone: () => void
}) {
  const { progress, startTime, onDone } = props
  const percent = Math.min(
    100,
    Math.round((progress.current / progress.total) * 100),
  )

  function getEstimatedTime(): string {
    if (!startTime || progress.current === 0) return "Calculating..."
    const elapsed = Date.now() - startTime
    const msPerItem = elapsed / progress.current
    const remainingMs = msPerItem * (progress.total - progress.current)
    if (remainingMs < 1000) return "Almost done..."
    const seconds = Math.ceil(remainingMs / 1000)
    return seconds > 60
      ? `${Math.ceil(seconds / 60)}m remaining`
      : `${seconds}s remaining`
  }

  if (progress.status === "complete") {
    return (
      <div className="view center">
        <div className="emoji">✅</div>
        <h1>Published Successfully!</h1>
        <p>Your design has been uploaded to Design Handoff.</p>
        <div className="card" style={{ width: "100%" }}>
          <strong>Summary:</strong>
          <span className="small">Total items processed: {progress.total}</span>
          {progress.apiCallCount !== undefined && (
            <span className="small">
              Total API calls made: {progress.apiCallCount}
            </span>
          )}
        </div>
        <button className="primary" onClick={onDone}>
          Done
        </button>
      </div>
    )
  }

  if (progress.status === "error") {
    return (
      <div className="view center">
        <div className="emoji">❌</div>
        <h1>Upload Failed</h1>
        <p className="error">
          {(progress as UploadProgress & { error?: string }).error ||
            "Something went wrong."}
        </p>
        <button className="primary" onClick={onDone}>
          Go Back
        </button>
      </div>
    )
  }

  const header =
    progress.status === "uploading" ? "Publishing..." : "Processing Design..."

  return (
    <div className="view">
      <h1>{header}</h1>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="row between small muted">
        <span>{percent}%</span>
        <span>{getEstimatedTime()}</span>
      </div>
      <p className="small">{progress.currentItemName}</p>
      <p className="small muted">Please do not close the plugin window.</p>
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function countLayers(
  layers: BackendPayload["frames"][string]["layers"],
): number {
  let n = 0
  for (const l of layers) {
    n += 1
    if (l.children) n += countLayers(l.children)
  }
  return n
}
