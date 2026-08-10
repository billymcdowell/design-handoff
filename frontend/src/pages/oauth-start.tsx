import { useEffect, useState } from "react"
import { useSearchParams } from "react-router"
import { Loader2 } from "lucide-react"
import { pb } from "@/lib/pocketbase"
import {
  OAUTH_PROVIDER,
  OAUTH_STORAGE_KEY,
  type StoredOauth,
} from "@/lib/oauth-relay"

/**
 * Plugin entry: opens in the system browser with ?session=<capability id>.
 * Fetches Microsoft auth URL + PKCE from PocketBase, stashes verifier/state,
 * then redirects to Microsoft Entra ID.
 */
export default function OauthStartPage() {
  const [searchParams] = useSearchParams()
  const session = (searchParams.get("session") || "").trim()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!session || session.length < 15) {
        setError("Missing or invalid session. Re-open Sign in from the Figma plugin.")
        return
      }

      try {
        const methods = await pb.collection("users").listAuthMethods()
        const provider = methods.oauth2?.providers?.find(
          (p) => p.name === OAUTH_PROVIDER,
        )
        if (!provider?.authURL) {
          throw new Error(
            "Microsoft sign-in is not enabled. In PocketBase Admin → users → OAuth2, enable Microsoft and set your Azure AD client ID/secret.",
          )
        }

        const redirectUrl = `${window.location.origin}/oauth/callback`
        const stored: StoredOauth = {
          session,
          provider: provider.name,
          state: provider.state,
          codeVerifier: provider.codeVerifier,
          redirectUrl,
        }
        sessionStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(stored))

        if (!cancelled) {
          window.location.assign(provider.authURL + encodeURIComponent(redirectUrl))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void start()
    return () => {
      cancelled = true
    }
  }, [session])

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-3 text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold">Sign-in failed</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
            <h1 className="text-xl font-semibold">Redirecting to Microsoft…</h1>
            <p className="text-sm text-muted-foreground">
              Complete sign-in in this window. The Figma plugin will pick up your
              session automatically.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
