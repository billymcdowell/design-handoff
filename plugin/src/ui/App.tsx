import { useEffect, useRef, useState, type FormEvent } from "react"
import type {
  BackendPayload,
  Project,
  UploadedFrameLink,
  UploadProgress,
} from "../types"
import { copyToClipboard } from "./clipboard"

// ── UI → Main helper ─────────────────────────────────────────────────────────
function post(message: Record<string, unknown>) {
  parent.postMessage({ pluginMessage: message }, "*")
}

export function App() {
  // 7.1 — state
  const [token, setToken] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [canPublish, setCanPublish] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectionCount, setSelectionCount] = useState(0)
  const [duplicateNames, setDuplicateNames] = useState<string[]>([])
  const [isPublishing, setIsPublishing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isSyncingComponents, setIsSyncingComponents] = useState(false)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authMethod, setAuthMethod] = useState<"microsoft" | "password" | null>(
    null,
  )
  const [authError, setAuthError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  )
  const [startTime, setStartTime] = useState<number | null>(null)
  const [foundationsNote, setFoundationsNote] = useState<string | null>(null)
  const [componentsNote, setComponentsNote] = useState<string | null>(null)

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
        setDuplicateNames(
          Array.isArray(msg.duplicateNames)
            ? (msg.duplicateNames as string[])
            : [],
        )
        break

      case "AUTH_RESULT": {
        const newToken = (msg.token as string | null) ?? null
        setIsAuthenticating(false)
        setAuthMethod(null)
        if (newToken) {
          setToken(newToken)
          setDisplayName((msg.displayName as string | undefined) || "User")
          setCanPublish(msg.canPublish === true)
          setLoading(false)
          setAuthError(null)
          setLoadingProjects(true)
          setTimeout(() => post({ type: "FETCH_PROJECTS", token: newToken }), 100)
        } else {
          const errMsg = msg.error as string | undefined
          if (errMsg && errMsg !== "Sign-in cancelled.") setAuthError(errMsg)
          else if (errMsg === "Sign-in cancelled.") setAuthError(null)
          else if (!loadingRef.current && isAuthenticatingRef.current) {
            setAuthError("Sign-in failed. Please try again.")
          }
          setToken(null)
          setDisplayName(null)
          setCanPublish(false)
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
            "❌ Failed to load projects. Please check your connection and try again.",
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
          uploadedFrames: msg.uploadedFrames as UploadedFrameLink[] | undefined,
          skippedFrames: msg.skippedFrames as string[] | undefined,
          ...(success ? {} : { error: msg.error as string | undefined }),
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

      case "COMPONENTS_SYNC_PROGRESS": {
        // Keep button label busy; note optional progress name
        const name = msg.currentItemName as string | undefined
        if (name) {
          setComponentsNote(`Exporting “${name}”…`)
        }
        break
      }

      case "COMPONENTS_SYNC_COMPLETE": {
        setIsSyncingComponents(false)
        if (msg.success as boolean) {
          const fileName = (msg.fileName as string | undefined) || "this file"
          const changeLabel =
            (msg.changeLabel as string | undefined) || "no changes"
          setComponentsNote(
            `Synced “${fileName}” (${changeLabel}). Other Figma files’ slices are kept.`,
          )
        } else {
          setComponentsNote(null)
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
  function handleMicrosoftLogin() {
    setIsAuthenticating(true)
    setAuthMethod("microsoft")
    setAuthError(null)
    post({ type: "LOGIN_MICROSOFT" })
  }

  function handlePasswordLogin(email: string, password: string) {
    setIsAuthenticating(true)
    setAuthMethod("password")
    setAuthError(null)
    post({ type: "LOGIN_PASSWORD", email, password })
  }

  function handleCancelLogin() {
    post({ type: "CANCEL_LOGIN" })
    setIsAuthenticating(false)
    setAuthMethod(null)
  }

  function handlePublish() {
    if (!canPublish) {
      post({
        type: "NOTIFY",
        message:
          "❌ This account is read-only. Ask an admin to set your role to designer.",
      })
      return
    }
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
    if (!canPublish) {
      post({
        type: "NOTIFY",
        message:
          "❌ This account is read-only. Ask an admin to set your role to designer.",
      })
      return
    }
    setIsExporting(true)
    setFoundationsNote(null)
    post({ type: "EXPORT_FOUNDATIONAL" })
  }

  function handleSyncComponents() {
    if (!canPublish) {
      post({
        type: "NOTIFY",
        message:
          "❌ This account is read-only. Ask an admin to set your role to designer.",
      })
      return
    }
    setIsSyncingComponents(true)
    setComponentsNote(null)
    post({ type: "SYNC_COMPONENTS", token: tokenRef.current })
  }

  function handleLogout() {
    post({ type: "LOGOUT" })
    setToken(null)
    setDisplayName(null)
    setCanPublish(false)
    setProjects([])
    setSelectedProjectId("")
    setUploadProgress(null)
    setIsPublishing(false)
    setIsExporting(false)
    setIsSyncingComponents(false)
    setAuthError(null)
    setAuthMethod(null)
    setFoundationsNote(null)
    setComponentsNote(null)
    setDuplicateNames([])
  }

  // ── View routing (7.3) ──────────────────────────────────────────────────────
  if (loading) return <LoadingView />
  if (!token)
    return (
      <LoginView
        onMicrosoftLogin={handleMicrosoftLogin}
        onPasswordLogin={handlePasswordLogin}
        onCancel={handleCancelLogin}
        isAuthenticating={isAuthenticating}
        authMethod={authMethod}
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
      duplicateNames={duplicateNames}
      framesUsed={framesUsed}
      displayName={displayName || "User"}
      canPublish={canPublish}
      isPublishing={isPublishing}
      isExporting={isExporting}
      isSyncingComponents={isSyncingComponents}
      foundationsNote={foundationsNote}
      componentsNote={componentsNote}
      onPublish={handlePublish}
      onExportFoundational={handleExportFoundational}
      onSyncComponents={handleSyncComponents}
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
  onMicrosoftLogin: () => void
  onPasswordLogin: (email: string, password: string) => void
  onCancel: () => void
  isAuthenticating: boolean
  authMethod: "microsoft" | "password" | null
  authError: string | null
}) {
  const {
    onMicrosoftLogin,
    onPasswordLogin,
    onCancel,
    isAuthenticating,
    authMethod,
    authError,
  } = props
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const waitingMicrosoft = isAuthenticating && authMethod === "microsoft"
  const waitingPassword = isAuthenticating && authMethod === "password"
  const formDisabled = isAuthenticating

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (formDisabled) return
    const trimmed = email.trim()
    if (!trimmed || !password) return
    onPasswordLogin(trimmed, password)
  }

  return (
    <div className="view">
      <h1>Design Handoff</h1>
      <p>
        Sign in with Microsoft or your email and password. Only accounts with
        role <strong>designer</strong> can publish; developers can sign in
        read-only.
      </p>
      {authError && <div className="error small">{authError}</div>}

      {waitingMicrosoft ? (
        <>
          <p className="small">
            Waiting for Microsoft sign-in in your browser…
          </p>
          <button className="primary" disabled>
            Signing in…
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </>
      ) : (
        <button
          className="primary"
          onClick={onMicrosoftLogin}
          disabled={formDisabled}
        >
          Sign in with Microsoft
        </button>
      )}

      <div className="auth-divider">
        <span>or</span>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={formDisabled}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={formDisabled}
            required
          />
        </div>
        <button
          className="primary"
          type="submit"
          disabled={formDisabled || !email.trim() || !password}
        >
          {waitingPassword ? "Signing in…" : "Sign in with email"}
        </button>
      </form>

      <div className="spacer" />
      <p className="small">
        Microsoft opens a browser window to complete sign-in. New Microsoft
        accounts are provisioned as developer until an admin promotes them in
        PocketBase.
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
  duplicateNames: string[]
  framesUsed: number
  displayName: string
  canPublish: boolean
  isPublishing: boolean
  isExporting: boolean
  isSyncingComponents: boolean
  foundationsNote: string | null
  componentsNote: string | null
  onPublish: () => void
  onExportFoundational: () => void
  onSyncComponents: () => void
  onLogout: () => void
}) {
  const {
    projects,
    loadingProjects,
    selectedProjectId,
    setSelectedProjectId,
    selectionCount,
    duplicateNames,
    framesUsed,
    displayName,
    canPublish,
    isPublishing,
    isExporting,
    isSyncingComponents,
    foundationsNote,
    componentsNote,
    onPublish,
    onExportFoundational,
    onSyncComponents,
    onLogout,
  } = props

  const hasDuplicateNames = duplicateNames.length > 0
  const publishDisabled =
    !canPublish ||
    selectionCount === 0 ||
    hasDuplicateNames ||
    !selectedProjectId ||
    isPublishing
  const foundationalDisabled = !canPublish || isExporting || isSyncingComponents
  const componentsDisabled = !canPublish || isExporting || isSyncingComponents

  return (
    <div className="view">
      <div className="row between">
        <h1>Design Handoff Project</h1>
        <span className="badge">Beta</span>
      </div>

      {!canPublish && (
        <div className="error small">
          This account is read-only (developer). Ask an admin to set your role
          to designer to publish.
        </div>
      )}

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
        ) : hasDuplicateNames ? (
          <p className="small error">
            {duplicateNames.length === 1 ? (
              <>
                The frame name{" "}
                <strong>&ldquo;{duplicateNames[0] || "(unnamed)"}&rdquo;</strong>{" "}
                is used more than once. Rename frames so each name is unique
                before publishing.
              </>
            ) : (
              <>
                These frame names are used more than once:{" "}
                <strong>
                  {duplicateNames.map((name, index) => (
                    <span key={`${name}-${index}`}>
                      {index > 0 ? ", " : null}
                      &ldquo;{name || "(unnamed)"}&rdquo;
                    </span>
                  ))}
                </strong>
                . Rename frames so each name is unique before publishing.
              </>
            )}
          </p>
        ) : (
          <p className="small">{selectionCount} frame(s) selected</p>
        )}
      </div>

      <button className="primary" disabled={publishDisabled} onClick={onPublish}>
        {isPublishing ? "Processing..." : "Publish"}
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

      <button disabled={componentsDisabled} onClick={onSyncComponents}>
        {isSyncingComponents ? "Syncing components..." : "Sync components"}
      </button>
      <p className="small muted">
        Mirrors this file’s local components &amp; component sets into your
        shared Components catalog (previews + variants). Sync library files
        here.
      </p>
      {componentsNote && <p className="small">{componentsNote}</p>}

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
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
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

  function copyText(key: string, text: string) {
    // Keep this synchronous so the click gesture stays valid for execCommand.
    const ok = copyToClipboard(text)
    if (!ok) return
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current))
    }, 1500)
  }

  function openUrl(url: string) {
    post({ type: "OPEN_EXTERNAL", url })
  }

  if (progress.status === "complete") {
    const uploaded = progress.uploadedFrames ?? []
    const skipped = progress.skippedFrames ?? []
    const allSkipped = uploaded.length === 0 && skipped.length > 0
    const allLinksText = uploaded.map((f) => `${f.name}\n${f.url}`).join("\n\n")

    return (
      <div className="view center">
        <div className="emoji">{allSkipped ? "↷" : "✅"}</div>
        <h1>{allSkipped ? "Nothing New to Publish" : "Published Successfully!"}</h1>
        <p>
          {allSkipped
            ? "Every selected frame matched the latest version — no new versions were created."
            : "Your design has been uploaded to Design Handoff."}
        </p>
        <div className="card" style={{ width: "100%" }}>
          <strong>Summary:</strong>
          {uploaded.length > 0 && (
            <span className="small">
              Uploaded: {uploaded.length} frame
              {uploaded.length === 1 ? "" : "s"}
            </span>
          )}
          {skipped.length > 0 && (
            <span className="small">
              Skipped (no changes): {skipped.join(", ")}
            </span>
          )}
          {uploaded.length === 0 && skipped.length === 0 && (
            <span className="small">Total items processed: {progress.total}</span>
          )}
        </div>
        {uploaded.length > 0 && (
          <div className="card share-card" style={{ width: "100%" }}>
            <div className="row between">
              <strong>Share links</strong>
              {uploaded.length > 1 && (
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => copyText("all", allLinksText)}
                >
                  {copiedKey === "all" ? "Copied!" : "Copy all"}
                </button>
              )}
            </div>
            <ul className="share-list">
              {uploaded.map((frame) => (
                <li key={frame.id} className="share-item">
                  <div className="share-meta">
                    <span className="share-name">{frame.name}</span>
                    <span className="share-url" title={frame.url}>
                      {frame.url}
                    </span>
                  </div>
                  <div className="share-actions">
                    <button
                      type="button"
                      className="share-copy"
                      onClick={() => copyText(frame.id, frame.url)}
                    >
                      {copiedKey === frame.id ? "Copied!" : "Copy"}
                    </button>
                    <button
                      type="button"
                      className="share-open"
                      title="Open in browser"
                      aria-label={`Open ${frame.name} in browser`}
                      onClick={() => openUrl(frame.url)}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M6.5 3.5H3.5A1 1 0 0 0 2.5 4.5v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M9.5 2.5h4v4M13.5 2.5l-6 6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
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
        <p className="error">{progress.error || "Something went wrong."}</p>
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
