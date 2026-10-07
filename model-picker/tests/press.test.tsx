import { expect, test } from 'claude-code/testing'

test('按 Model ↑ 會跑 /model', async ($, on) => {
  const ran: string[] = []
  on('command.run', ($, e) => {
    ran.push(e.command)
    return { text: '' }
  })
  const ui = await $.ui.mount({
    plugin: 'model-picker',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: '⏵⏵ auto mode on (shift+tab to cycle)' },
  })
  await ui.press({ key: 'model-picker' })
  expect(ran).toEqual(['model'])
  await ui.unmount()
})
