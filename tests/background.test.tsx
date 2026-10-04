import { expect, mock, test } from 'claude-code/testing'

test('a background session leaves the row as the engine draws it', async ($, on) => {
  mock.env(on, { HOME: '/home/me', CLAUDE_CODE_SESSION_KIND: 'bg' })
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
  expect(await ui.find({ type: 'Image' })).toBe(undefined)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine row')
})
