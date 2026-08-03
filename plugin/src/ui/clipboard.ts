/**
 * Copy text from the plugin UI iframe.
 *
 * `navigator.clipboard` is often blocked in Figma's sandboxed UI, and awaiting
 * it can burn the user-activation gesture needed for the legacy fallback.
 * Prefer a synchronous `execCommand('copy')` path first.
 */
export function copyToClipboard(text: string): boolean {
  if (typeof document === "undefined") return false

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.top = "0"
  textarea.style.left = "0"
  textarea.style.width = "1px"
  textarea.style.height = "1px"
  textarea.style.padding = "0"
  textarea.style.border = "none"
  textarea.style.outline = "none"
  textarea.style.boxShadow = "none"
  textarea.style.background = "transparent"
  textarea.style.opacity = "0"

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  let ok = false
  try {
    ok = document.execCommand("copy")
  } catch {
    ok = false
  } finally {
    document.body.removeChild(textarea)
  }

  if (ok) return true

  return false
}
