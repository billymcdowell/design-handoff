// ─── Manual multipart/form-data builder ────────────────────────────────────
// The Figma main-thread sandbox has no FormData / TextEncoder, so we build the
// multipart body by hand (char-code → byte). Used to attach the frame PNG to a
// stock PocketBase `create` request (frames.image file field).

export function stringToUint8Array(str: string): Uint8Array {
  const arr = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i)
  return arr
}

export function randomBoundary(): string {
  let s = ""
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  for (let i = 0; i < 13; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `----WebKitFormBoundary${s}`
}

export interface MultipartField {
  name: string
  value: string
}

export interface MultipartFile {
  name: string // form field name
  fileName: string
  contentType: string
  bytes: Uint8Array
}

/** Assemble a multipart body of plain text fields + one or more file parts. */
export function buildMultipartBody(
  boundary: string,
  fields: MultipartField[],
  files: MultipartFile[],
): Uint8Array {
  const chunks: Uint8Array[] = []

  for (const field of fields) {
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${field.name}"\r\n\r\n` +
      `${field.value}\r\n`
    chunks.push(stringToUint8Array(header))
  }

  for (const file of files) {
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${file.name}"; filename="${file.fileName}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n`
    chunks.push(stringToUint8Array(header))
    chunks.push(file.bytes)
    chunks.push(stringToUint8Array("\r\n"))
  }

  chunks.push(stringToUint8Array(`--${boundary}--\r\n`))

  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return body
}
