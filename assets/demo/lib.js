// 每一格由 render(t) 依時間算出，截圖時逐格呼叫，畫面完全可重現
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
const lerp = (a, b, x) => a + (b - a) * x
const seg = (t, a, b) => clamp((t - a) / (b - a))
const $ = s => document.querySelector(s)

// 游標沿著 keyframes [{t, x, y}] 移動；clicks 是點擊時間點
function cursorAt(t, keys, clicks) {
  let x = keys[0].x, y = keys[0].y
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1]
    if (t >= a.t && t <= b.t) { const k = ease(seg(t, a.t, b.t)); x = lerp(a.x, b.x, k); y = lerp(a.y, b.y, k) }
    if (t > b.t) { x = b.x; y = b.y }
  }
  const c = $('.cursor'), r = $('.ring')
  let press = 1, ringO = 0, ringS = .4
  for (const ct of clicks) {
    const d = t - ct
    if (d >= 0 && d < .18) press = 1 - .18 * Math.sin(d / .18 * Math.PI)
    if (d >= 0 && d < .5) { ringO = 1 - d / .5; ringS = .4 + d / .5 * .9 }
  }
  c.style.transform = `translate(${x - 4}px, ${y - 2}px) scale(${press})`
  r.style.left = x + 'px'; r.style.top = y + 'px'
  r.style.opacity = ringO; r.style.transform = `scale(${ringS})`
}

// 字幕：[{t, html}]，切換時淡入淡出
function captionAt(t, list) {
  let cur = list[0], i = 0
  list.forEach((c, j) => { if (t >= c.t) { cur = c; i = j } })
  const next = list[i + 1]
  const fadeIn = clamp((t - cur.t) / .3), fadeOut = next ? clamp((next.t - t) / .3) : 1
  const el = $('.caption')
  el.innerHTML = cur.html
  el.style.opacity = Math.min(fadeIn, fadeOut)
  el.style.transform = `translateY(${(1 - fadeIn) * 6}px)`
}

const CURSOR_SVG = '<svg viewBox="0 0 26 26"><path d="M4 2 L4 21 L9 16.5 L12.5 24 L15.5 22.6 L12 15.2 L19 15.2 Z" fill="#141413" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
document.addEventListener('DOMContentLoaded', () => {
  document.body.insertAdjacentHTML('beforeend', `<div class="ring"></div><div class="cursor">${CURSOR_SVG}</div>`)
})
