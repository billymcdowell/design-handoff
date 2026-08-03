import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"

type Point = { x: number; y: number }
type Rect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

function rectsIntersect(a: Rect, b: DOMRect): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

function normalizeRect(a: Point, b: Point): Rect {
  const left = Math.min(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const right = Math.max(a.x, b.x)
  const bottom = Math.max(a.y, b.y)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

function isMarqueeBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  return !!target.closest(
    [
      "button",
      "a",
      "input",
      "textarea",
      "select",
      "label",
      "[role='checkbox']",
      "[role='menuitem']",
      "[data-frame-card]",
      "[data-no-marquee]",
      "[data-slot='dropdown-menu-trigger']",
    ].join(","),
  )
}

/**
 * Click-drag on empty space to draw a selection rectangle over `[data-frame-id]` items.
 * Does not start when the pointer is on a frame card or interactive control.
 */
export function useMarqueeSelect({
  enabled,
  containerRef,
  onSelect,
}: {
  enabled: boolean
  containerRef: RefObject<HTMLElement | null>
  onSelect: (ids: string[], additive: boolean) => void
}) {
  const [rect, setRect] = useState<Rect | null>(null)
  const originRef = useRef<Point | null>(null)
  const additiveRef = useRef(false)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled || e.button !== 0) return
      if (isMarqueeBlockedTarget(e.target)) return
      const container = containerRef.current
      if (!container) return

      additiveRef.current = e.shiftKey || e.metaKey || e.ctrlKey
      originRef.current = { x: e.clientX, y: e.clientY }
      setRect({
        left: e.clientX,
        top: e.clientY,
        right: e.clientX,
        bottom: e.clientY,
        width: 0,
        height: 0,
      })

      const onMove = (ev: PointerEvent) => {
        if (!originRef.current) return
        setRect(normalizeRect(originRef.current, { x: ev.clientX, y: ev.clientY }))
      }

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onUp)

        const origin = originRef.current
        originRef.current = null

        if (!origin) {
          setRect(null)
          return
        }

        const final = normalizeRect(origin, { x: ev.clientX, y: ev.clientY })
        setRect(null)

        if (final.width < 4 && final.height < 4) {
          if (!additiveRef.current) onSelect([], false)
          return
        }

        const nodes = container.querySelectorAll<HTMLElement>("[data-frame-id]")
        const ids: string[] = []
        nodes.forEach((node) => {
          const id = node.dataset.frameId
          if (!id) return
          if (rectsIntersect(final, node.getBoundingClientRect())) ids.push(id)
        })
        onSelect(ids, additiveRef.current)
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onUp)
      e.preventDefault()
    },
    [enabled, containerRef, onSelect],
  )

  useEffect(() => {
    if (!enabled) {
      setRect(null)
      originRef.current = null
    }
  }, [enabled])

  return {
    rect,
    isSelecting: rect !== null,
    onPointerDown,
  }
}
