import { expect, test } from 'claude-code/testing'

import { barCells, fitCells, titleCells } from '../hooks/register'

const cells = (s: string) => [...s].reduce((n, ch) => n + (/[⺀-￯]/.test(ch) ? 2 : 1), 0)

test('名稱依格數裁切，中文算 2 格，超過加「…」', async () => {
  expect(fitCells('寫 Behance 作品頁', 40)).toBe('寫 Behance 作品頁')
  const cut = fitCells('測試剛剛安裝好的mods然後再調整一下顏色和寬度', 12)
  expect(cut.endsWith('…')).toBe(true)
  expect(cells(cut)).toBeLessThanOrEqual(12)
})

test('視窗越寬，名稱可用格數越多；再窄也至少 6 格', async () => {
  expect(titleCells(160)).toBeGreaterThan(titleCells(100))
  expect(titleCells(20)).toBe(6)
})

test('進度條跟著視窗寬度縮，太窄直接拿掉；整列加起來不超過視窗寬', async () => {
  expect(barCells(160)).toBe(16)
  expect(barCells(95)).toBe(12)
  expect(barCells(75)).toBe(8)
  expect(barCells(60)).toBe(0)
  for (const columns of [60, 72, 80, 90, 100, 120, 160]) {
    const bar = barCells(columns)
    const used = 2 + 2 + 14 + 6 + 3 + (bar > 0 ? bar + 1 : 0) + titleCells(columns)
    expect(used).toBeLessThanOrEqual(columns)
  }
})
