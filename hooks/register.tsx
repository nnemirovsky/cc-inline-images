import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import { cells, imagePaths, mimeOf, picture } from './image'
import type { Picture } from './image'

// Images in the transcript, drawn by the terminal (kitty graphics) right where
// they come up:
//
// * files Claude sends you (SendUserFile, SendUserMessage attachments)
// * images Claude reads (Read)
// * images you paste ([Image #N])
// * image paths in replies, prompts and shell output: a line to click open
//
// and a pane for an image path handed to the session from outside (the
// agterm hotkey writes it to an inbox file next to the session).
//
// The mod runs where Claude Code runs, so on a server it reads the file there
// and the pixels reach the terminal inside the ssh stream: no copying.

const open = atom({ plugin: 'inline-images', key: 'open' } as const, [])
const pane = atom({ plugin: 'inline-images', key: 'pane' } as const, null)

const PANE = 'inline-image'
const INBOX = '.cache/inline-images/inbox'

// Decoded pictures and file checks, so a redraw does not decode again.
const pictures = new Map<string, Picture>()
const existing = new Map<string, boolean>()
type Pasted = { mime: string; base64: string }
let pasted: { key: string; images: Pasted[] }[] | undefined

function remember(key: string, pic: Picture): Picture {
  if (pictures.size > 64) pictures.delete(pictures.keys().next().value!)
  pictures.set(key, pic)
  return pic
}

function fromBase64(key: string, base64: string, mime: string): Picture {
  return pictures.get(key) ?? remember(key, picture(Uint8Array.fromBase64(base64), mime))
}

async function resolvePath($: EngineInterface, path: string): Promise<string> {
  if (path.startsWith('~/')) return `${(await $.env.get('HOME')) ?? ''}${path.slice(1)}`
  if (path.startsWith('/')) return path
  return `${await $.session.cwd()}/${path.replace(/^\.\//, '')}`
}

async function isImageFile($: EngineInterface, path: string): Promise<boolean> {
  const cached = existing.get(path)
  if (cached !== undefined) return cached
  let isFile = false
  try {
    isFile = (await $.fs.stat(path)).kind === 'file'
  } catch {
    isFile = false
  }
  existing.set(path, isFile)
  return isFile
}

async function fromFile($: EngineInterface, path: string): Promise<Picture> {
  const mime = mimeOf(path)
  if (!mime) return { kind: 'error', reason: 'not an image' }
  try {
    const stat = await $.fs.stat(path)
    const key = `${path}@${stat.mtimeMs}`
    const hit = pictures.get(key)
    if (hit) return hit
    const { base64 } = await $.fs.read(path, { as: 'bytes' })
    return remember(key, picture(Uint8Array.fromBase64(base64), mime))
  } catch {
    return { kind: 'error', reason: 'cannot read the file' }
  }
}

type ReadImage = { type: 'image'; file: { base64: string; type: string } }
type Attachment = { path: string; isImage?: boolean }

function readImage(output: unknown): ReadImage | undefined {
  const o = output as ReadImage | undefined
  return o?.type === 'image' && typeof o.file?.base64 === 'string' ? o : undefined
}

function attachments(output: unknown): Attachment[] {
  const list = (output as { attachments?: Attachment[] } | undefined)?.attachments
  return Array.isArray(list) ? list.filter(a => a.isImage === true && typeof a.path === 'string') : []
}

// The images of the user message whose text carries these [Image #N] marks.
async function pastedImages($: EngineInterface, text: string): Promise<Pasted[]> {
  const marks = text.match(/\[Image #\d+\]/g) ?? []
  if (marks.length === 0) return []
  const find = () => pasted?.findLast(m => marks.every(mark => m.key.includes(mark)))
  if (!find()) {
    const messages = await $.session.messages({ as: 'api' })
    pasted = messages
      .filter(m => m.role === 'user')
      .map(m => {
        const blocks = m.content as { type: string; text?: string; source?: { type: string; media_type?: string; data?: string } }[]
        return {
          key: blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n'),
          images: blocks
            .filter(b => b.type === 'image' && b.source?.type === 'base64' && b.source.data)
            .map(b => ({ mime: b.source!.media_type ?? 'image/png', base64: b.source!.data! })),
        }
      })
      .filter(m => m.images.length > 0)
  }
  return find()?.images ?? []
}

// The element table, typed for the terminal; callers check the surface first.
type Els = { Box: any; Image: any; Text: any; Button: any }
function els($: EngineInterface, e: RenderInput): Els {
  return $.ui.resolve(e) as unknown as Els
}

// One picture as the surface draws it, or a dim line saying why not.
function drawPicture($: EngineInterface, e: RenderInput, pic: Picture, maxCols: number, maxRows: number, alt: string) {
  if (e.surface !== 'terminal') return undefined
  const { Box, Image, Text } = els($, e)
  if (pic.kind === 'error') return <Text dimColor>{`  [${alt}: ${pic.reason}]`}</Text>
  const size = cells(pic.width, pic.height, maxCols, maxRows)
  const source =
    pic.kind === 'png' ? { png: pic.base64 } : { rgba: pic.base64, width: pic.width, height: pic.height }
  return (
    <Box marginLeft={2}>
      <Image source={source} columns={size.columns} rows={size.rows} alt={alt} />
    </Box>
  )
}

function width(e: RenderInput): number {
  return Math.min(120, (e.viewport?.columns ?? 100) - 8)
}

// Lines to click open for the image paths a text mentions, each followed by
// the picture while it is open.
async function clickable($: EngineInterface, e: RenderInput, text: string) {
  if (e.surface !== 'terminal') return []
  const found: { shown: string; path: string }[] = []
  for (const shown of imagePaths(text)) {
    const path = await resolvePath($, shown)
    if (await isImageFile($, path)) found.push({ shown, path })
  }
  if (found.length === 0) return []
  const { Box, Button } = els($, e)
  const isOpen = await read($, open)
  const rows = []
  for (const [i, f] of found.entries()) {
    const key = `${e.requestId}|${f.path}`
    const shown = isOpen.includes(key)
    rows.push(
      <Box key={`img-${i}`} marginLeft={2}>
        <Button
          key={`toggle-${i}`}
          plain
          label={`${shown ? '▾' : '▸'} ${f.shown}`}
          onPress={() => update($, open, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))}
        />
      </Box>,
    )
    if (shown) rows.push(drawPicture($, e, await fromFile($, f.path), width(e), 30, f.shown))
  }
  return rows
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const home = (await $.env.get('HOME')) ?? ''
    const names = [await $.session.id(), await $.env.get('AGTERM_SESSION_ID')].filter((n): n is string => !!n)
    $.clock.every(1000, () => {
      void (async () => {
        for (const name of names) {
          const file = `${home}/${INBOX}/${name}`
          if (!(await $.fs.exists(file))) continue
          const requested = (await $.fs.read(file)).trim()
          if (!requested) continue
          await $.fs.write(file, '')
          const path = await resolvePath($, requested)
          await update($, pane, () => path)
          await $.ui.open({ id: PANE, title: path.split('/').pop() ?? 'image', focus: true, closeOnEscape: true })
        }
      })().catch(() => undefined)
    })
    return next(e)
  })

  // A new prompt may carry pasted images the cache has not seen.
  on('session.append', { door: 'prompt' }, ($, e, next) => {
    pasted = undefined
    return next(e)
  })

  // Images Claude reads: in fullscreen the reads fold into one group line.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const drawn = await next(e)
    if (e.surface !== 'terminal') return drawn
    const images = e.props.calls
      .map((c, i) => ({ c, i, img: c.tool === 'Read' ? readImage(c.output) : undefined }))
      .filter(x => x.img !== undefined)
    // Shell output folded into the group: its image paths, to click open.
    const shell = e.props.calls
      .filter(c => c.tool === 'Bash')
      .map(c => (c.output as { stdout?: string } | undefined)?.stdout ?? '')
      .join('\n')
    const links = await clickable($, e, shell)
    if (images.length === 0 && links.length === 0) return drawn
    const { Box } = els($, e)
    return (
      <Box flexDirection="column">
        {drawn}
        {images.map(({ c, i, img }) =>
          drawPicture($, e, fromBase64(c.tool_use_id ?? `${e.requestId}:${i}`, img!.file.base64, img!.file.type), width(e), 24, 'image'),
        )}
        {links}
      </Box>
    )
  })

  // A standalone tool row's result: Read images, sent files, shell output.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const drawn = await next(e)
    if (e.surface !== 'terminal' || e.props.isErrored) return drawn
    const { Box } = els($, e)
    const extra = []
    const img = e.props.tool === 'Read' ? readImage(e.props.output) : undefined
    if (img) extra.push(drawPicture($, e, fromBase64(e.props.tool_use_id, img.file.base64, img.file.type), width(e), 24, 'image'))
    for (const a of attachments(e.props.output)) {
      extra.push(drawPicture($, e, await fromFile($, await resolvePath($, a.path)), width(e), 24, a.path.split('/').pop() ?? 'image'))
    }
    if (e.props.tool === 'Bash') {
      const out = e.props.output as { stdout?: string } | undefined
      extra.push(...(await clickable($, e, out?.stdout ?? '')))
    }
    if (extra.length === 0) return drawn
    return (
      <Box flexDirection="column">
        {drawn}
        {extra}
      </Box>
    )
  })

  // Your prompts: pasted images inline, mentioned paths to click open.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const drawn = await next(e)
    if (e.surface !== 'terminal' || e.props.origin.kind !== 'composer') return drawn
    const images = await pastedImages($, e.props.text)
    const extra = [
      ...images.map((p, i) => drawPicture($, e, fromBase64(`${e.requestId}:${i}`, p.base64, p.mime), width(e), 16, 'pasted image')),
      ...(await clickable($, e, e.props.text)),
    ]
    if (extra.length === 0) return drawn
    const { Box } = els($, e)
    return (
      <Box flexDirection="column">
        {drawn}
        {extra}
      </Box>
    )
  })

  // Claude's replies: mentioned paths to click open.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const drawn = await next(e)
    const extra = await clickable($, e, e.props.text)
    if (extra.length === 0) return drawn
    const { Box } = els($, e)
    return (
      <Box flexDirection="column">
        {drawn}
        {extra}
      </Box>
    )
  })

  // The pane the hotkey opens: the whole image, fitted to the pane.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = els($, e)
    const path = await read($, pane)
    if (!path) return <Text dimColor>No image.</Text>
    const pic = await fromFile($, path)
    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-start">
          {path}
        </Text>
        {drawPicture($, e, pic, e.props.bodyColumns - 2, Math.max(4, e.props.scroll.bodyRows - 1), path.split('/').pop() ?? 'image')}
      </Box>
    )
  })
}
