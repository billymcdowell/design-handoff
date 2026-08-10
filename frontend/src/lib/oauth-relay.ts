export const OAUTH_STORAGE_KEY = "design-handoff-oauth"
export const OAUTH_PROVIDER = "microsoft"

export type StoredOauth = {
  session: string
  provider: string
  state: string
  codeVerifier: string
  redirectUrl: string
}
