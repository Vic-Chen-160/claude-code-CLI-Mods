// 逐格截圖再用 ffmpeg 合成 GIF：node render.mjs <scene>  （需要 puppeteer-core、ffmpeg、Google Chrome）
import { mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = dirname(fileURLToPath(import.meta.url))
const scene = process.argv[2]
const fps = 20
const tmp = join(process.env.TMPDIR ?? '/tmp', `demo-${scene}`)
rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true })

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 660, deviceScaleFactor: 1 })
await page.goto(`file://${join(here, scene)}.html`)
await page.evaluate(() => document.fonts.ready)
const duration = await page.evaluate(() => window.DURATION)
const frames = Math.round(duration * fps)
for (let i = 0; i < frames; i++) {
  await page.evaluate(t => window.render(t), i / fps)
  await page.screenshot({ path: join(tmp, `f${String(i).padStart(4, '0')}.png`) })
}
await browser.close()

const out = join(here, '..', `${scene}.gif`)
const filter = 'scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle'
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(tmp, 'f%04d.png'), '-filter_complex', filter, '-loop', '0', out])
console.log(out)
