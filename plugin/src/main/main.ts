/// <reference types="@figma/plugin-typings" />

// ─── Design Handoff — main thread entry + message router ───────────────────────────

import { STORAGE_KEY_THEME, STORAGE_KEY_TOKEN } from "../constants"
import type { BackendPayload, FoundationalExport } from "../types"
import {
  extractLibraryComponents,
  formatComponentHistorySummary,
  planComponentSync,
  type ExistingLibraryComponentRow,
  type ExtractedLibraryComponent,
} from "./components"
import {
  countCatalogTokens,
  formatHistorySummary,
  getFoundationFileIdentity,
  getFoundationalElements,
  syncFoundationsData,
} from "./foundational"
import { fetchProjectsFromApi, resolveProjectForPublish } from "./planLimits"
import {
  assertCanPublish,
  createLibraryComponentRecord,
  createLibraryComponentVariantRecord,
  deleteLibraryComponentRecord,
  deleteLibraryComponentVariantRecord,
  findSharedComponentLibraryRecord,
  findSharedFoundationRecord,
  listLibraryComponentsByFileKey,
  listLibraryComponentVariants,
  startMicrosoftLogin,
  updateLibraryComponentRecord,
  updateLibraryComponentVariantRecord,
  upsertSharedComponentLibraryRecord,
  upsertSharedFoundationRecord,
  validateAuthToken,
} from "./pbClient"
import { createBackendPayload, isPublishableFrame } from "./publish"
import { uploadData } from "./upload"

async function syncLibraryComponentVariants(
  token: string,
  libraryComponentId: string,
  component: ExtractedLibraryComponent,
): Promise<void> {
  const existing = await listLibraryComponentVariants(token, libraryComponentId)
  const existingByKey = new Map(
    existing.map((row) => [String(row.key ?? ""), row]),
  )
  const nextKeys = new Set(component.variantPayloads.map((v) => v.key))

  for (const row of existing) {
    const key = String(row.key ?? "")
    if (!nextKeys.has(key)) {
      await deleteLibraryComponentVariantRecord(token, String(row.id))
    }
  }

  for (const variant of component.variantPayloads) {
    const prev = existingByKey.get(variant.key)
    const fields = {
      library_component: libraryComponentId,
      key: variant.key,
      name: variant.name,
      properties: variant.properties,
      figma_node_id: variant.figma_node_id,
      is_default: variant.is_default,
      width: variant.width,
      height: variant.height,
      layers: variant.layers,
      layer_details: variant.layer_details,
      content_hash: variant.content_hash,
    }
    const preview = {
      bytes: variant.previewBytes,
      fileName: variant.previewFileName,
    }

    if (!prev) {
      await createLibraryComponentVariantRecord(token, fields, preview)
      continue
    }

    const prevHash =
      typeof prev.content_hash === "string" ? prev.content_hash : undefined
    if (prevHash === variant.content_hash) continue

    await updateLibraryComponentVariantRecord(
      token,
      String(prev.id),
      fields,
      preview,
    )
  }
}

figma.showUI(__html__, { width: 400, height: 600, themeColors: true })

// Selection listener — register immediately.
function publishableSelectionCount(): number {
  return figma.currentPage.selection.filter(isPublishableFrame).length
}
figma.on("selectionchange", () => {
  figma.ui.postMessage({
    type: "SELECTION_CHANGED",
    count: publishableSelectionCount(),
  })
})

/** Shared cancel flag for in-flight Microsoft OAuth polling. */
let oauthCancel: { cancelled: boolean } | null = null

type Msg = { type: string; [key: string]: unknown }

function postAuthResult(
  check: Extract<Awaited<ReturnType<typeof validateAuthToken>>, { ok: true }>,
) {
  figma.ui.postMessage({
    type: "AUTH_RESULT",
    token: check.token,
    displayName: check.displayName,
    userId: check.userId,
    role: check.role,
    canPublish: check.canPublish,
  })
}

figma.ui.onmessage = async (msg: Msg) => {
  switch (msg.type) {
    // ── Auth ────────────────────────────────────────────────────────────────
    case "CHECK_AUTH": {
      const token = await figma.clientStorage.getAsync(STORAGE_KEY_TOKEN)
      if (!token) {
        figma.ui.postMessage({ type: "AUTH_RESULT", token: null })
        break
      }
      try {
        const check = await validateAuthToken(token)
        if (!check.ok) {
          await figma.clientStorage.setAsync(STORAGE_KEY_TOKEN, null)
          figma.ui.postMessage({
            type: "AUTH_RESULT",
            token: null,
            error: check.error,
          })
          break
        }
        // Persist refreshed JWT when PocketBase rotates it.
        if (check.token !== token) {
          await figma.clientStorage.setAsync(STORAGE_KEY_TOKEN, check.token)
        }
        postAuthResult(check)
      } catch (err) {
        // Offline / unreachable — keep the stored token but show a generic label.
        console.log("CHECK_AUTH validation failed, using stored token", err)
        figma.ui.postMessage({
          type: "AUTH_RESULT",
          token,
          displayName: "User",
          canPublish: false,
        })
      }
      break
    }

    case "LOGIN_MICROSOFT": {
      if (oauthCancel) oauthCancel.cancelled = true
      oauthCancel = { cancelled: false }
      const cancel = oauthCancel
      try {
        const check = await startMicrosoftLogin(cancel)
        if (cancel.cancelled) {
          figma.ui.postMessage({
            type: "AUTH_RESULT",
            token: null,
            error: "Sign-in cancelled.",
          })
          break
        }
        if (!check.ok) {
          figma.ui.postMessage({
            type: "AUTH_RESULT",
            token: null,
            error: check.error,
          })
          break
        }
        await figma.clientStorage.setAsync(STORAGE_KEY_TOKEN, check.token)
        const saved = await figma.clientStorage.getAsync(STORAGE_KEY_TOKEN)
        if (saved === check.token) {
          postAuthResult(check)
        } else {
          throw new Error("Read-back mismatch")
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        figma.notify(`❌ Failed to sign in: ${message}`)
        await figma.clientStorage.setAsync(STORAGE_KEY_TOKEN, null)
        figma.ui.postMessage({
          type: "AUTH_RESULT",
          token: null,
          error: message,
        })
      } finally {
        if (oauthCancel === cancel) oauthCancel = null
      }
      break
    }

    case "CANCEL_LOGIN": {
      if (oauthCancel) oauthCancel.cancelled = true
      figma.ui.postMessage({
        type: "AUTH_RESULT",
        token: null,
        error: "Sign-in cancelled.",
      })
      break
    }

    case "LOGOUT": {
      if (oauthCancel) oauthCancel.cancelled = true
      await figma.clientStorage.setAsync(STORAGE_KEY_TOKEN, null)
      figma.ui.postMessage({ type: "AUTH_RESULT", token: null })
      break
    }

    // ── Projects ──────────────────────────────────────────────────────────────
    case "FETCH_PROJECTS": {
      try {
        const token =
          (msg.token as string) ||
          (await figma.clientStorage.getAsync(STORAGE_KEY_TOKEN))
        if (!token) throw new Error("Not signed in. Please log in again.")

        const projects = await fetchProjectsFromApi(token)
        figma.ui.postMessage({ type: "PROJECTS_LOADED", projects })
      } catch (err) {
        const unauthorized =
          (err as { unauthorized?: boolean })?.unauthorized === true
        if (unauthorized) {
          await figma.clientStorage.setAsync(STORAGE_KEY_TOKEN, null)
          figma.ui.postMessage({ type: "AUTH_RESULT", token: null })
        }
        const message = err instanceof Error ? err.message : String(err)
        figma.ui.postMessage({ type: "PROJECTS_ERROR", error: message })
        figma.notify(`❌ Failed to load projects: ${message}`)
      }
      break
    }

    // ── Publish ───────────────────────────────────────────────────────────────
    case "PUBLISH": {
      const projectId = msg.projectId as string
      try {
        if (!projectId) {
          figma.notify("❌ Please select a project first")
          figma.ui.postMessage({ type: "PUBLISH_COMPLETE", success: false })
          return
        }

        const selection = figma.currentPage.selection
        if (selection.length === 0) {
          figma.notify("❌ Please select at least one frame.")
          figma.ui.postMessage({ type: "PUBLISH_COMPLETE", success: false })
          return
        }

        const token = await figma.clientStorage.getAsync(STORAGE_KEY_TOKEN)
        if (!token) {
          figma.notify("❌ Please authenticate first.")
          figma.ui.postMessage({ type: "PUBLISH_COMPLETE", success: false })
          return
        }

        const auth = await validateAuthToken(token)
        if (!auth.ok) {
          figma.notify(`❌ ${auth.error}`)
          figma.ui.postMessage({ type: "PUBLISH_COMPLETE", success: false })
          return
        }
        if (!auth.canPublish) {
          const msgText = assertCanPublish(auth.collectionName, {
            role: auth.role,
          })
          figma.notify(`❌ ${msgText || "This account cannot publish."}`)
          figma.ui.postMessage({
            type: "PUBLISH_COMPLETE",
            success: false,
            error: msgText || "This account cannot publish.",
          })
          return
        }
        if (auth.token !== token) {
          await figma.clientStorage.setAsync(STORAGE_KEY_TOKEN, auth.token)
        }

        const frames = selection.filter(isPublishableFrame)
        if (frames.length === 0) {
          figma.notify(
            "❌ Please select at least one frame, component, or instance.",
          )
          figma.ui.postMessage({ type: "PUBLISH_COMPLETE", success: false })
          return
        }

        // Confirm the selected project still exists before expensive extraction.
        await resolveProjectForPublish({
          token: auth.token,
          selectedProjectId: projectId,
          framesToAdd: frames.length,
        })

        const payload = await createBackendPayload(
          frames,
          projectId,
          auth.token,
          (current, total, currentItemName) => {
            figma.ui.postMessage({
              type: "UPLOAD_PROGRESS",
              current,
              total,
              currentItemName,
              status: "processing",
            })
          },
        )

        figma.ui.postMessage({ type: "DATA_READY_FOR_UPLOAD", payload })
        figma.notify("✅ Data serialized! Uploading...")
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        figma.notify(`❌ ${message}`)
        figma.ui.postMessage({
          type: "PUBLISH_COMPLETE",
          success: false,
          error: message,
        })
      }
      break
    }

    case "UPLOAD_DATA": {
      const payload = msg.payload as BackendPayload
      const token = msg.token as string
      const result = await uploadData(
        payload,
        token,
        (current, total, currentItemName) => {
          figma.ui.postMessage({
            type: "UPLOAD_PROGRESS",
            current,
            total,
            currentItemName,
            status: "uploading",
          })
        },
      )
      if (!result.success && result.error) figma.notify(`❌ ${result.error}`)
      figma.ui.postMessage({
        type: "UPLOAD_COMPLETE",
        success: result.success,
        error: result.error,
        apiCallCount: result.apiCallCount,
        uploadedFrames: result.uploadedFrames,
        skippedFrames: result.skippedFrames,
      })
      break
    }

    // ── Foundational (variables + styles) — user-scoped, shared by all projects
    case "EXPORT_FOUNDATIONAL": {
      try {
        const data = await getFoundationalElements()
        figma.ui.postMessage({
          type: "FOUNDATIONAL_DATA_READY_FOR_UPLOAD",
          data,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        figma.notify(`❌ ${message}`)
        figma.ui.postMessage({
          type: "FOUNDATIONAL_UPLOAD_COMPLETE",
          success: false,
          error: message,
        })
      }
      break
    }

    case "UPLOAD_FOUNDATIONAL_DATA": {
      const data = msg.data as FoundationalExport
      try {
        const token =
          (msg.token as string) ||
          (await figma.clientStorage.getAsync(STORAGE_KEY_TOKEN))
        if (!token) {
          figma.ui.postMessage({
            type: "FOUNDATIONAL_UPLOAD_COMPLETE",
            success: false,
            error: "Not authenticated",
          })
          return
        }

        const check = await validateAuthToken(token)
        if (!check.ok) {
          figma.ui.postMessage({
            type: "FOUNDATIONAL_UPLOAD_COMPLETE",
            success: false,
            error: check.error,
          })
          return
        }
        if (check.token !== token) {
          await figma.clientStorage.setAsync(STORAGE_KEY_TOKEN, check.token)
        }
        if (!check.canPublish) {
          const msgText = assertCanPublish(check.collectionName, {
            role: check.role,
          })
          figma.ui.postMessage({
            type: "FOUNDATIONAL_UPLOAD_COMPLETE",
            success: false,
            error: msgText || "This account cannot sync foundations.",
          })
          return
        }
        const authToken = check.token

        const { fileKey, fileName } = getFoundationFileIdentity()
        const existing = await findSharedFoundationRecord(authToken)
        const existingData = existing?.data ?? null

        // Tokens are keyed by Figma variable/style id; renames update `name`
        // on the same id (diff emits changed name, not remove+add).
        const { data: synced, historyEntry } = syncFoundationsData(
          existingData,
          {
            fileKey,
            fileName,
            variables: data.variables,
            styles: data.styles,
          },
        )

        if (!historyEntry) {
          figma.notify(`Foundations unchanged for “${fileName}”`)
          figma.ui.postMessage({
            type: "FOUNDATIONAL_UPLOAD_COMPLETE",
            success: true,
            fileName,
            summary: null,
            changeLabel: "no changes",
          })
          return
        }

        const counts = countCatalogTokens(synced.catalog)
        await upsertSharedFoundationRecord(authToken, {
          data: synced,
          variables_count: counts.variables_count,
          styles_count: counts.styles_count,
        })

        const changeLabel = formatHistorySummary(historyEntry.summary)
        figma.notify(
          `✅ Foundations synced from “${fileName}” (${changeLabel})`,
        )
        figma.ui.postMessage({
          type: "FOUNDATIONAL_UPLOAD_COMPLETE",
          success: true,
          fileName,
          summary: historyEntry.summary,
          changeLabel,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        figma.notify(`❌ ${message}`)

        figma.ui.postMessage({
          type: "FOUNDATIONAL_UPLOAD_COMPLETE",
          success: false,
          error: message,
        })
      }
      break
    }

    case "SYNC_COMPONENTS": {
      try {
        const token =
          (msg.token as string) ||
          (await figma.clientStorage.getAsync(STORAGE_KEY_TOKEN))
        if (!token) {
          figma.ui.postMessage({
            type: "COMPONENTS_SYNC_COMPLETE",
            success: false,
            error: "Not authenticated",
          })
          return
        }

        const check = await validateAuthToken(token)
        if (!check.ok) {
          figma.ui.postMessage({
            type: "COMPONENTS_SYNC_COMPLETE",
            success: false,
            error: check.error,
          })
          return
        }
        if (check.token !== token) {
          await figma.clientStorage.setAsync(STORAGE_KEY_TOKEN, check.token)
        }
        if (!check.canPublish) {
          const msgText = assertCanPublish(check.collectionName, {
            role: check.role,
          })
          figma.ui.postMessage({
            type: "COMPONENTS_SYNC_COMPLETE",
            success: false,
            error: msgText || "This account cannot sync components.",
          })
          return
        }
        const authToken = check.token

        figma.ui.postMessage({
          type: "COMPONENTS_SYNC_PROGRESS",
          current: 0,
          total: 1,
          currentItemName: "Scanning components...",
        })

        const { fileKey, fileName, components } = await extractLibraryComponents(
          (current, total, name) => {
            figma.ui.postMessage({
              type: "COMPONENTS_SYNC_PROGRESS",
              current,
              total,
              currentItemName: name,
            })
          },
        )

        const existingMeta = await findSharedComponentLibraryRecord(authToken)
        const existingRowsRaw = await listLibraryComponentsByFileKey(
          authToken,
          fileKey,
        )
        const existingRows: ExistingLibraryComponentRow[] = existingRowsRaw.map(
          (row) => ({
            id: String(row.id),
            key: String(row.key ?? ""),
            name: String(row.name ?? ""),
            kind:
              row.kind === "COMPONENT_SET" ? "COMPONENT_SET" : "COMPONENT",
            content_hash:
              typeof row.content_hash === "string" ? row.content_hash : undefined,
          }),
        )

        const plan = planComponentSync({
          existingMetaRaw: existingMeta?.data ?? null,
          existingRows,
          fileKey,
          fileName,
          extracted: components,
        })

        if (!plan.historyEntry) {
          figma.notify(`Components unchanged for “${fileName}”`)
          figma.ui.postMessage({
            type: "COMPONENTS_SYNC_COMPLETE",
            success: true,
            fileName,
            changeLabel: "no changes",
          })
          return
        }

        for (const id of plan.toDeleteIds) {
          await deleteLibraryComponentRecord(authToken, id)
        }

        for (const component of plan.toCreate) {
          const created = await createLibraryComponentRecord(
            authToken,
            {
              key: component.key,
              name: component.name,
              kind: component.kind,
              file_key: fileKey,
              file_name: fileName,
              figma_node_id: component.figma_node_id,
              page_name: component.page_name,
              hidden: component.hidden,
              variants: component.variants,
              tokens_used: component.tokens_used,
              description: component.description,
              content_hash: component.content_hash,
            },
            {
              bytes: component.previewBytes,
              fileName: component.previewFileName,
            },
          )
          await syncLibraryComponentVariants(
            authToken,
            String(created.id),
            component,
          )
        }

        for (const { existingId, component } of plan.toUpdate) {
          await updateLibraryComponentRecord(
            authToken,
            existingId,
            {
              key: component.key,
              name: component.name,
              kind: component.kind,
              file_key: fileKey,
              file_name: fileName,
              figma_node_id: component.figma_node_id,
              page_name: component.page_name,
              hidden: component.hidden,
              variants: component.variants,
              tokens_used: component.tokens_used,
              description: component.description,
              content_hash: component.content_hash,
            },
            {
              bytes: component.previewBytes,
              fileName: component.previewFileName,
            },
          )
          await syncLibraryComponentVariants(authToken, existingId, component)
        }

        await upsertSharedComponentLibraryRecord(authToken, {
          data: plan.nextMeta,
          components_count: plan.componentsCount,
        })

        const changeLabel = formatComponentHistorySummary(
          plan.historyEntry.summary,
        )
        figma.notify(
          `✅ Components synced from “${fileName}” (${changeLabel})`,
        )
        figma.ui.postMessage({
          type: "COMPONENTS_SYNC_COMPLETE",
          success: true,
          fileName,
          changeLabel,
          summary: plan.historyEntry.summary,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        figma.notify(`❌ ${message}`)
        figma.ui.postMessage({
          type: "COMPONENTS_SYNC_COMPLETE",
          success: false,
          error: message,
        })
      }
      break
    }

    case "NOTIFY": {
      figma.notify(msg.message as string)
      break
    }

    // ── Legacy theme handlers (UI never calls these) ──────────────────────────
    case "GET_THEME": {
      const theme = await figma.clientStorage.getAsync(STORAGE_KEY_THEME)
      figma.ui.postMessage({ type: "THEME_CHANGED", theme })
      break
    }

    case "THEME_CHANGE": {
      await figma.clientStorage.setAsync(STORAGE_KEY_THEME, msg.theme)
      figma.ui.postMessage({ type: "THEME_CHANGED", theme: msg.theme })
      break
    }

    default:
      break
  }
}
