import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import { cells, imagePaths, mimeOf, picture } from './image'
import type { Picture } from './image'

// Images in the transcript, drawn by the terminal (kitty graphics) right where
// they come up:
//
// * files Claude sends you (SendUserFile, SendUserMessage attachments)
// * images you paste ([Image #N])
// * images Claude reads (Read), image paths in replies, prompts and shell
//   output: a line to click open
//
// What Claude looked at while working stays folded, and a folded run of tool
// calls shows none of it until you unfold the run.
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

// A background session (`claude --bg`, viewed through `claude attach`) never
// asks the terminal about kitty graphics, so it draws an Image as its alt text
// unless CLAUDE_CODE_FORCE_TERMINAL_IMAGES is set. Without it the mod stays out
// of the way and leaves the inbox alone, so a hotkey falls back to its viewer.
let isBackground: boolean | undefined
let cannotDraw: boolean | undefined

async function background($: EngineInterface): Promise<boolean> {
  isBackground ??= (await $.env.get('CLAUDE_CODE_SESSION_KIND')) === 'bg'
  return isBackground
}

async function inBackground($: EngineInterface): Promise<boolean> {
  cannotDraw ??= (await background($)) && !(await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'))
  return cannotDraw
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

// A `▸ label` line to click, and the picture under it while it is open.
async function fold(
  $: EngineInterface,
  e: RenderInput,
  line: { id: string; key: string; label: string },
  load: () => Picture | Promise<Picture>,
) {
  const { Box, Button } = els($, e)
  const { id, key, label } = line
  const shown = (await read($, open)).includes(key)
  return [
    <Box key={`img-${id}`} marginLeft={2}>
      <Button
        key={`toggle-${id}`}
        plain
        label={`${shown ? '▾' : '▸'} ${label}`}
        onPress={() => update($, open, list => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]))}
      />
    </Box>,
    shown ? drawPicture($, e, await load(), width(e), 30, label) : undefined,
  ]
}

// Lines to click open for the image paths a text mentions.
async function clickable($: EngineInterface, e: RenderInput, text: string) {
  if (e.surface !== 'terminal') return []
  const rows = []
  let i = 0
  for (const shown of imagePaths(text)) {
    const path = await resolvePath($, shown)
    if (!(await isImageFile($, path))) continue
    rows.push(...(await fold($, e, { id: `${i++}`, key: `${e.requestId}|${path}`, label: shown }, () => fromFile($, path))))
  }
  return rows
}

// What goes under a finished tool call: the files Claude sent you, drawn, and
// what it only looked at (an image it read, the image paths in shell output)
// as lines to click open. Clicks need the fullscreen renderer, so on the main
// screen a read image is drawn.
async function under($: EngineInterface, e: RenderInput, call: { id: string; tool: string; output: unknown; path?: string }) {
  if (e.surface !== 'terminal') return []
  const rows = []
  for (const a of attachments(call.output)) {
    rows.push(drawPicture($, e, await fromFile($, await resolvePath($, a.path)), width(e), 24, a.path.split('/').pop() ?? 'image'))
  }
  const img = call.tool === 'Read' ? readImage(call.output) : undefined
  if (img) {
    const label = call.path?.split('/').pop() || 'image'
    const load = () => fromBase64(call.id, img.file.base64, img.file.type)
    if (e.viewport?.isFullscreen === true) rows.push(...(await fold($, e, { id: 'read', key: `${call.id}|read`, label }, load)))
    else rows.push(drawPicture($, e, load(), width(e), 24, label))
  }
  if (call.tool === 'Bash') rows.push(...(await clickable($, e, (call.output as { stdout?: string } | undefined)?.stdout ?? '')))
  return rows
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const home = (await $.env.get('HOME')) ?? ''
    if (await inBackground($)) return next(e)
    // The daemon hands a background session the pane id of the terminal that
    // started it, which belongs to another session; answer to the session id only.
    const paneId = (await background($)) ? undefined : await $.env.get('AGTERM_SESSION_ID')
    const names = [await $.session.id(), paneId].filter((n): n is string => !!n)
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

  // A row drawn in full has its result in it: a call of a run you unfolded,
  // and every call under ctrl+o or --verbose. A folded run is left as it is.
  on('ui.render', { component: 'ToolUse', props: { isExpanded: true } }, async ($, e, next) => {
    const drawn = await next(e)
    if (await inBackground($)) return drawn
    if (e.props.isErrored || e.props.output === undefined) return drawn
    const path = (e.props.input as { file_path?: unknown } | undefined)?.file_path
    const extra = await under($, e, {
      id: e.props.tool_use_id,
      tool: e.props.tool,
      output: e.props.output,
      path: typeof path === 'string' ? path : undefined,
    })
    if (extra.length === 0) return drawn
    const { Box } = els($, e)
    return (
      <Box flexDirection="column">
        {drawn}
        {extra}
      </Box>
    )
  })

  // The result under a standalone tool row; drawn in full, the row above has it.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const drawn = await next(e)
    if (await inBackground($)) return drawn
    if (e.props.isErrored || e.props.isExpanded === true) return drawn
    const extra = await under($, e, { id: e.props.tool_use_id, tool: e.props.tool, output: e.props.output })
    if (extra.length === 0) return drawn
    const { Box } = els($, e)
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
    if (await inBackground($)) return drawn
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
    if (await inBackground($)) return drawn
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
