// ─── Frame PNG store (main-thread only) ────────────────────────────────────
// Raw PNG bytes are heavy, so they never travel through the UI iframe. The
// publish pipeline stashes them here keyed by Frame.id; the upload step reads
// them back when creating each `frames` record with its image file attached.

export interface PendingImage {
  bytes: Uint8Array
  fileName: string
}

const store = new Map<string, PendingImage>()

export function setPendingImage(frameId: string, image: PendingImage): void {
  store.set(frameId, image)
}

export function getPendingImage(frameId: string): PendingImage | undefined {
  return store.get(frameId)
}

export function clearPendingImages(): void {
  store.clear()
}
