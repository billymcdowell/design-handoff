/// <reference types="@figma/plugin-typings" />

// ─── Concurrency & font helpers ───────────────────────────────────────────

// 10.1 ── Pre-load every unique font used by the selected frames ────────────
export async function batchLoadFonts(frames: readonly SceneNode[]): Promise<void> {
  const fontSet = new Set<string>()
  const fontByKey = new Map<string, FontName>()

  const walk = (node: SceneNode) => {
    if (node.type === "TEXT") {
      const fn = (node as TextNode).fontName
      if (fn !== figma.mixed && typeof fn === "object") {
        const key = `${fn.family}-${fn.style}`
        fontSet.add(key)
        if (!fontByKey.has(key)) fontByKey.set(key, fn)
      }
    }
    if ("children" in node) {
      for (const child of node.children) walk(child)
    }
  }
  for (const frame of frames) walk(frame)

  await Promise.all(
    Array.from(fontSet).map(async (key) => {
      const fontName = fontByKey.get(key)
      if (!fontName) return
      try {
        await figma.loadFontAsync(fontName)
      } catch (e) {
        console.warn(`Failed to load font ${key}`, e)
      }
    }),
  )

  console.log(`Loaded ${fontSet.size} unique fonts in parallel`)
}

// 10.2 ── Process items in fixed-size parallel batches ──────────────────────
export async function processFramesInParallel<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<void>,
  concurrency = 3,
  onProgress?: (completed: number, total: number, message: string) => void,
): Promise<void> {
  let completed = 0
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    await Promise.all(
      batch.map((item, batchIndex) =>
        processor(item, i + batchIndex).then(() => {
          completed++
          onProgress?.(
            completed,
            items.length,
            `Processed ${completed}/${items.length} items...`,
          )
        }),
      ),
    )
  }
}

// ── Generic ordered concurrency (used for record creation) ──────────────────
export async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 5,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const settled = await Promise.all(
      batch.map((item, batchIndex) => worker(item, i + batchIndex)),
    )
    settled.forEach((r, batchIndex) => {
      results[i + batchIndex] = r
    })
  }
  return results
}
