import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { pb } from "@/lib/pocketbase"
import {
  OAUTH_STORAGE_KEY,
  type StoredOauth,
} from "@/lib/oauth-relay"

/**
 * Microsoft redirects here with ?code=&state=. Exchanges the code via
 * PocketBase, writes the JWT into oauth_sessions/{session}, and tells the
 * user they can close the tab (the plugin is polling that record).
 */
export default function OauthCallbackPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<"working" | "done" | "error">("working")
  const [message, setMessage] = useState("Completing Microsoft sign-in…")

  useEffect(() => {
    let cancelled = false

    async function finish() {
      const code = searchParams.get("code")
      const state = searchParams.get("state")
      const oauthError = searchParams.get("error")
      const oauthErrorDesc = searchParams.get("error_description")

      if (oauthError) {
        setStatus("error")
        setMessage(oauthErrorDesc || oauthError || "Microsoft sign-in was cancelled.")
        sessionStorage.removeItem(OAUTH_STORAGE_KEY)
        return
      }

      if (!code || !state) {
        setStatus("error")
        setMessage("Missing authorization code. Try signing in again from the plugin.")
        return
      }

      let stored: StoredOauth | null = null
      try {
        const raw = sessionStorage.getItem(OAUTH_STORAGE_KEY)
        if (raw) stored = JSON.parse(raw) as StoredOauth
      } catch {
        stored = null
      }

      if (!stored?.session || !stored.codeVerifier || !stored.redirectUrl) {
        setStatus("error")
        setMessage(
          "Sign-in session expired or was opened in a different browser. Start again from the Figma plugin.",
        )
        return
      }

      if (stored.state !== state) {
        setStatus("error")
        setMessage("OAuth state mismatch. Start again from the Figma plugin.")
        sessionStorage.removeItem(OAUTH_STORAGE_KEY)
        return
      }

      try {
        const authData = await pb.collection("users").authWithOAuth2Code(
          stored.provider || "microsoft",
          code,
          stored.codeVerifier,
          stored.redirectUrl,
          // New Microsoft users are provisioned as developer (hook also defaults).
          { emailVisibility: true },
        )

        const token = authData.token || pb.authStore.token
        if (!token) {
          throw new Error("PocketBase did not return an auth token.")
        }

        await pb.collection("oauth_sessions").update(stored.session, { token })

        // Clear the browser auth store — this tab only relays the token to
        // the plugin; it is not a web-app login session.
        pb.authStore.clear()
        sessionStorage.removeItem(OAUTH_STORAGE_KEY)

        if (!cancelled) {
          setStatus("done")
          setMessage(
            "You're signed in. You can close this tab and return to the Figma plugin.",
          )
        }
      } catch (err) {
        sessionStorage.removeItem(OAUTH_STORAGE_KEY)
        if (!cancelled) {
          setStatus("error")
          setMessage(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void finish()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-3 text-center">
        {status === "working" && (
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
        )}
        {status === "done" && (
          <CheckCircle2 className="mx-auto size-8 text-green-600" />
        )}
        {status === "error" && (
          <XCircle className="mx-auto size-8 text-destructive" />
        )}
        <h1 className="text-xl font-semibold">
          {status === "working"
            ? "Signing you in…"
            : status === "done"
              ? "Signed in"
              : "Sign-in failed"}
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
