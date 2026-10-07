import { expect, test } from 'claude-code/testing'

import { colorOf } from '../hooks/register'
import type { TaskEntry } from '../types'

const base: TaskEntry = {
  id: 'a',
  cwd: '/tmp',
  title: '寫 Behance 作品頁',
  tty: '/dev/ttys009',
  pid: 1,
  status: 'working',
  startedAt: 1,
  finishedAt: 0,
  done: 1,
  total: 4,
  active: '正在讀檔案',
  waiting: false,
}

test('「？」那列是紅色，一般列和完成列是黑色', async () => {
  expect(colorOf({ ...base, waiting: true })).toBe('#D0021B')
  expect(colorOf(base)).toBe('#000000')
  expect(colorOf({ ...base, status: 'done' })).toBe('#000000')
})

test('整塊是淺灰底', async ($, on) => {
  const ui = await $.ui.mount({
    plugin: 'task-progress',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20 },
  })
  const box = await ui.find({ type: 'Box' })
  expect(box?.props.backgroundColor).toBe('#E6E6E6')
  await ui.unmount()
})
