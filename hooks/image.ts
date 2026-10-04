import { decode as decodeJpeg } from './vendor/jpeg.js'
import { GifReader } from './vendor/omggif.js'

// Turns image bytes into something the terminal's Image element takes: a PNG
// as is, or decoded RGBA pixels for JPEG and GIF. Pure functions, no `$`.

export type Picture =
  | { kind: 'png'; base64: string; width: number; height: number }
  | { kind: 'rgba'; base64: string; width: number; height: number }
  | { kind: 'error'; reason: string }

// The Image element takes at most 2 MiB of decoded bytes and 2048 pixels a side.
const MAX_BYTES = 2 * 1024 * 1024
const MAX_SIDE = 1600
const MAX_PIXELS = Math.floor(MAX_BYTES / 4)

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

export function mimeOf(path: string): string | undefined {
  const ext = path.toLowerCase().match(/\.([a-z]+)$/)?.[1]
  return ext ? MIME[ext] : undefined
}

function pngSize(b: Uint8Array): { width: number; height: number } | undefined {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return undefined
  const at = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0
  return { width: at(16), height: at(20) }
}

// Area-average downscale of RGBA pixels, so text in screenshots stays legible.
function downscale(src: Uint8Array, w: number, h: number, tw: number, th: number): Uint8Array {
  const out = new Uint8Array(tw * th * 4)
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor((y * h) / th)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / th))
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor((x * w) / tw)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / tw))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * w + sx) * 4
          r += src[i]!
          g += src[i + 1]!
          b += src[i + 2]!
          a += src[i + 3]!
        }
      }
      const n = (y1 - y0) * (x1 - x0)
      const o = (y * tw + x) * 4
      out[o] = r / n
      out[o + 1] = g / n
      out[o + 2] = b / n
      out[o + 3] = a / n
    }
  }
  return out
}

function rgba(pixels: Uint8Array, width: number, height: number): Picture {
  const scale = Math.min(1, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_PIXELS / (width * height)))
  if (scale >= 1) return { kind: 'rgba', base64: pixels.toBase64(), width, height }
  const tw = Math.max(1, Math.floor(width * scale))
  const th = Math.max(1, Math.floor(height * scale))
  return { kind: 'rgba', base64: downscale(pixels, width, height, tw, th).toBase64(), width: tw, height: th }
}

export function picture(bytes: Uint8Array, mime: string): Picture {
  try {
    if (mime === 'image/png') {
      const size = pngSize(bytes)
      if (!size) return { kind: 'error', reason: 'not a PNG' }
      if (bytes.length > MAX_BYTES) return { kind: 'error', reason: 'PNG over 2 MiB' }
      return { kind: 'png', base64: bytes.toBase64(), ...size }
    }
    if (mime === 'image/jpeg') {
      const img = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 })
      return rgba(img.data, img.width, img.height)
    }
    if (mime === 'image/gif') {
      const gif = new GifReader(bytes)
      const pixels = new Uint8Array(gif.width * gif.height * 4)
      gif.decodeAndBlitFrameRGBA(0, pixels)
      return rgba(pixels, gif.width, gif.height)
    }
    return { kind: 'error', reason: `${mime.replace('image/', '').toUpperCase()} is not drawn` }
  } catch {
    return { kind: 'error', reason: 'could not decode' }
  }
}

// A cell is about twice as tall as wide, and about 8 image pixels across at
// common font sizes; small images are not blown up past that.
export function cells(width: number, height: number, maxCols: number, maxRows: number): { columns: number; rows: number } {
  const limitCols = Math.max(4, Math.min(255, maxCols))
  const limitRows = Math.max(1, Math.min(255, maxRows))
  let columns = Math.min(limitCols, Math.max(4, Math.ceil(width / 8)))
  let rows = Math.max(1, Math.round((columns * height) / width / 2))
  if (rows > limitRows) {
    rows = limitRows
    columns = Math.max(4, Math.min(limitCols, Math.round((rows * 2 * width) / height)))
  }
  return { columns, rows }
}

// Image paths in free text: absolute, ~/, ./ or relative with a directory.
const PATH = /(?:~\/|\.{1,2}\/|\/)?(?:[\w@%+=,.~-]+\/)*[\w@%+=,.~-]+\.(?:png|jpe?g|gif|webp)\b/gi

export function imagePaths(text: string): string[] {
  const seen = new Set<string>()
  for (const m of text.matchAll(PATH)) {
    const p = m[0]
    if (p.includes('/')) seen.add(p)
  }
  return [...seen]
}
