/// <reference types="@figma/plugin-typings" />

// ─── Design Handoff — main thread entry + message router ───────────────────────────

import { STORAGE_KEY_THEME, STORAGE_KEY_TOKEN } from "../constants"
import type { BackendPayload, FoundationalExport } from "../types"
import {
  countCatalogTokens,
  formatHistorySummary,
  getFoundationFileIdentity,
  getFoundationalElements,
  syncFoundationsData,
} from "./foundational"
import { fetchProjectsFromApi, resolveProjectForPublish } from "./planLimits"
import {
  authWithPassword,
  findFoundationRecord,
  resolveFoundationOwnerId,
  upsertFoundationRecord,
  validateAuthToken,
} from "./pbClient"
import { createBackendPayload, isPublishableFrame } from "./publish"
import { uploadData } from "./upload"

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

type Msg = { type: string; [key: string]: unknown }

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
        figma.ui.postMessage({
          type: "AUTH_RESULT",
          token: check.token,
          displayName: check.displayName,
          userId: check.userId,
        })
      } catch (err) {
        // Offline / unreachable — keep the stored token but show a generic label.
        console.log("CHECK_AUTH validation failed, using stored token", err)
        figma.ui.postMessage({
          type: "AUTH_RESULT",
          token,
          displayName: "User",
        })
      }
      break
    }

    case "LOGIN": {
      // Validate on the main thread (sandbox fetch — no iframe CORS; matches
      // networkAccess).
      const email = String(msg.email ?? "").trim()
      const password = String(msg.password ?? "")
      try {
        const check = await authWithPassword(email, password)
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
          figma.ui.postMessage({
            type: "AUTH_RESULT",
            token: check.token,
            displayName: check.displayName,
            userId: check.userId,
          })
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
      }
      break
    }

    case "LOGOUT": {
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
          token,
          selectedProjectId: projectId,
          framesToAdd: frames.length,
        })

        const payload = await createBackendPayload(
          frames,
          projectId,
          token,
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

        // Always re-validate so we know whether this is a users vs _superusers
        // token. Superuser ids are not valid foundations.owner relation targets.
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
        const authToken = check.token

        const ownerId = await resolveFoundationOwnerId(authToken, check)
        const { fileKey, fileName } = getFoundationFileIdentity()
        const existing = await findFoundationRecord(authToken, ownerId)
        const existingData = existing?.data ?? null

        const { data: synced, historyEntry } = syncFoundationsData(
          existingData,
          {
            fileKey,
            fileName,
            variables: data.variables,
            styles: data.styles,
          },
        )

        const counts = countCatalogTokens(synced.catalog)
        await upsertFoundationRecord(authToken, {
          owner: ownerId,
          data: synced,
          variables_count: counts.variables_count,
          styles_count: counts.styles_count,
        })

        const changeLabel = historyEntry
          ? formatHistorySummary(historyEntry.summary)
          : "no changes"
        figma.notify(
          `✅ Foundations synced from “${fileName}” (${changeLabel})`,
        )
        figma.ui.postMessage({
          type: "FOUNDATIONAL_UPLOAD_COMPLETE",
          success: true,
          fileName,
          summary: historyEntry?.summary ?? null,
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
