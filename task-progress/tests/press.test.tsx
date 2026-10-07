import { expect, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20 },
} as const

test('按「＋ 開新對話」會叫 osascript 開 Terminal', async ($, on) => {
  const ran: string[][] = []
  on('process.run', async ($, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.cwd', () => ({ value: '/tmp' }))
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
  const ui = await $.ui.mount({ plugin: 'task-progress', surface: 'terminal', ...BAND })
  await ui.press({ key: 'new-session' })
  expect(ran.some(a => (a[0] ?? '').endsWith('osascript'))).toBe(true)
  expect(toasts.some(x => x.includes('失敗'))).toBe(false)
  await ui.unmount()
})
