import { expect, mock, test } from 'claude-code/testing'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACAQMAAABFZu8gAAAABlBMVEX/AAD///9BHTQRAAAADElEQVQI12NgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC'

test('a background session told the terminal draws images gets them', async ($, on) => {
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_SESSION_KIND: 'bg', CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' })
  on('fs.stat', () => ({ value: { kind: 'file', size: 120, mtimeMs: 1, isLink: false } }))
  on('fs.read', () => ({ value: { base64: PNG } }))
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  const ui = await $.ui.mount({
    plugin: 'inline-images',
    surface: 'terminal',
    component: 'ToolResult',
    props: {
      tool_use_id: 'toolu_1',
      tool: 'SendUserFile',
      output: { attachments: [{ path: '/home/me/shot.png', size: 120, isImage: true }] },
      isErrored: false,
    },
  })
  expect((await ui.find({ type: 'Image' }))?.props.source).toEqual({ png: PNG })
})
