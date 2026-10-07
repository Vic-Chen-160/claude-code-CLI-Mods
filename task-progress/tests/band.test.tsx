import { expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20 },
} as const

test('任務進度條：輸入框上方一定有「＋ 開新對話」按鈕', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'task-progress', surface, ...BAND })
    expect(await ui.find({ key: 'new-session' })).toBeDefined()
    await ui.unmount()
  }
})

test('有問卷佔用時讓出位置', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="engine">engine</Text>
  })
  const ui = await $.ui.mount({
    plugin: 'task-progress',
    surface: 'terminal',
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
  })
  expect(await ui.find({ key: 'new-session' })).toBeUndefined()
  await ui.unmount()
})
