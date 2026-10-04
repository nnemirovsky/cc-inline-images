import { expect, mock, test } from 'claude-code/testing'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACAQMAAABFZu8gAAAABlBMVEX/AAD///9BHTQRAAAADElEQVQI12NgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC'

const SENT = {
  tool_use_id: 'toolu_1',
  tool: 'SendUserFile',
  output: { attachments: [{ path: '/home/me/shot.png', size: 120, isImage: true }] },
  isErrored: false,
}

test('a file Claude sends is drawn under its row', async ($, on) => {
  mock.env(on, { HOME: '/home/me' })
  on('fs.stat', () => ({ value: { kind: 'file', size: 120, mtimeMs: 1, isLink: false } }))
  on('fs.read', () => ({ value: { base64: PNG } }))
  // Stands for the engine's own row.
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>› [image] /home/me/shot.png</Text>
  })
  const ui = await $.ui.mount({ plugin: 'inline-images', surface: 'terminal', component: 'ToolResult', props: SENT, viewport: { columns: 120, rows: 40 } })
  const image = await ui.find({ type: 'Image' })
  expect(image?.props.source).toEqual({ png: PNG })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('› [image] /home/me/shot.png')
})
