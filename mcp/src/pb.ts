import PocketBase from "pocketbase"

let client: PocketBase | null = null

export function getPb(): PocketBase {
  if (client) return client

  const url = process.env.DESIGN_HANDOFF_URL?.replace(/\/$/, "")
  const token = process.env.DESIGN_HANDOFF_TOKEN

  if (!url) {
    throw new Error(
      "DESIGN_HANDOFF_URL is not set (e.g. http://localhost:8090)"
    )
  }
  if (!token) {
    throw new Error(
      "DESIGN_HANDOFF_TOKEN is not set (PocketBase user JWT)"
    )
  }

  client = new PocketBase(url)
  client.autoCancellation(false)
  client.authStore.save(token, null)

  return client
}

/** Reset the singleton (useful in tests). */
export function resetPb(): void {
  client = null
}
