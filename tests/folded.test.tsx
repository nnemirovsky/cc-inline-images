import { expect, mock, test } from 'claude-code/testing'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACAQMAAABFZu8gAAAABlBMVEX/AAD///9BHTQRAAAADElEQVQI12NgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC'

const OUTPUT = { type: 'image', file: { base64: PNG, type: 'image/png', originalSize: 120 } }

// A call of an unfolded run: the row is drawn in full and holds its own result.
const READ = {
  tool_use_id: 'toolu_1',
  tool: 'Read',
  input: { file_path: '/home/me/shots/banner.png' },
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  isExpanded: true,
  output: OUTPUT,
}

const ROW = { plugin: 'inline-images', surface: 'terminal', component: 'ToolUse', requestId: 'toolu_1', props: READ } as const

test('an image Claude read is a folded line, drawn when clicked open', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  const ui = await $.ui.mount({ ...ROW, viewport: { columns: 120, rows: 40, isFullscreen: true } })
  expect((await ui.find({ key: 'toggle-read' }))?.props.label).toBe('▸ banner.png')
  expect(await ui.find({ type: 'Image' })).toBe(undefined)

  await ui.press({ key: 'toggle-read' })
  expect((await ui.find({ key: 'toggle-read' }))?.props.label).toBe('▾ banner.png')
  expect((await ui.find({ type: 'Image' }))?.props.source).toEqual({ png: PNG })

  await ui.press({ key: 'toggle-read' })
  expect(await ui.find({ type: 'Image' })).toBe(undefined)
})

test('on the main screen, where nothing can be clicked, a read image is drawn', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  const ui = await $.ui.mount({ ...ROW, viewport: { columns: 120, rows: 40, isFullscreen: false } })
  expect((await ui.find({ type: 'Image' }))?.props.source).toEqual({ png: PNG })
  expect(await ui.find({ key: 'toggle-read' })).toBe(undefined)
})

test('a result under a row drawn in full adds nothing: the row has it', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  const ui = await $.ui.mount({
    plugin: 'inline-images',
    surface: 'terminal',
    component: 'ToolResult',
    requestId: 'toolu_1',
    props: { tool_use_id: 'toolu_1', tool: 'Read', output: OUTPUT, isErrored: false, isExpanded: true },
    viewport: { columns: 120, rows: 40, isFullscreen: true },
  })
  expect(await ui.find({ key: 'toggle-read' })).toBe(undefined)
  expect(await ui.find({ type: 'Image' })).toBe(undefined)
})

test('a folded run of tool calls shows no image', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  const { isExpanded: _, ...call } = READ
  const ui = await $.ui.mount({
    plugin: 'inline-images',
    surface: 'terminal',
    component: 'ToolGroup',
    props: { calls: [call], isActive: false, isExpanded: false },
    viewport: { columns: 120, rows: 40, isFullscreen: true },
  })
  expect(await ui.find({ key: 'toggle-read' })).toBe(undefined)
  expect(await ui.find({ type: 'Image' })).toBe(undefined)
})
