import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { TaskEntry } from '../types'

const entries = atom({ plugin: 'task-progress', key: 'entries' } as const, [])
const selfId = atom({ plugin: 'task-progress', key: 'selfId' } as const, '')
const now = atom({ plugin: 'task-progress', key: 'now' } as const, 0)

// 跑完的任務保留多久（之後自動從列表消失）
const DONE_TTL_MS = 30 * 60 * 1000
const TICK_MS = 2000
// 權限詢問超過這麼久還沒放行，才算真的在等你（自動模式會在這之前自己放行）
const ASK_GRACE_MS = 2500
// 配色：淺灰底、黑字；等你確認的那一列整條變紅
const BG = '#E6E6E6'
const INK = '#000000'
const ALERT = '#D0021B'
export const colorOf = (entry: TaskEntry) => (entry.waiting ? ALERT : INK)

// 從 sh 往上找第一個有 tty 的祖先程序：那就是這個 claude
const FIND_TTY = `p=$PPID
for i in 1 2 3 4 5 6; do
  t=$(ps -o tty= -p "$p" | tr -d ' ')
  if [ -n "$t" ] && [ "$t" != "??" ]; then echo "$p /dev/$t"; exit 0; fi
  p=$(ps -o ppid= -p "$p" | tr -d ' ')
  [ -z "$p" ] && break
done
echo "0 "`

const FOCUS_TAB = [
  'on run argv',
  'set target to item 1 of argv',
  'tell application "Terminal"',
  'repeat with w in windows',
  'repeat with t in tabs of w',
  'if tty of t is target then',
  'set selected of t to true',
  'set index of w to 1',
  'activate',
  'return "ok"',
  'end if',
  'end repeat',
  'end repeat',
  'end tell',
  'return "missing"',
  'end run',
]

const NEW_SESSION = [
  'on run argv',
  'set p to item 1 of argv',
  'tell application "Terminal"',
  'do script "cd " & quoted form of p & " && claude"',
  'activate',
  'end tell',
  'end run',
]

const osa = (lines: string[]) => lines.flatMap(line => ['-e', line])

// 終端機寬度：中日韓全形字佔 2 格
const cellsOf = (ch: string) => (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) || (ch.codePointAt(0) ?? 0) > 0xffff ? 2 : 1)

// 依格數裁切，超過就截斷加「…」，保證不會換到第二行
export const fitCells = (text: string, max: number) => {
  const line = text.replace(/\s+/g, ' ').trim()
  if (max <= 0) return ''
  let used = 0
  const chars = [...line]
  for (const ch of chars) used += cellsOf(ch)
  if (used <= max) return line
  let out = ''
  used = 0
  for (const ch of chars) {
    const w = cellsOf(ch)
    if (used + w > max - 1) break
    out += ch
    used += w
  }
  return `${out}…`
}

// 進度條跟名稱一樣隨視窗寬度伸縮：寬 16 格、中 12、窄 8，太窄就整條拿掉
export const barCells = (columns: number) => (columns >= 110 ? 16 : columns >= 90 ? 12 : columns >= 72 ? 8 : 0)

// 一列裡名稱以外佔掉的格數：左右邊距 2、符號 2、通知 14、「前往→」6、間距，再加進度條和它的間距
// 「？」「●」「→」在中文終端機可能佔 2 格，一律按 2 格算，寧可多留空也不換行
const SYMBOL_CELLS = 2
const MESSAGE_CELLS = 14
const GO_CELLS = 6
export const titleCells = (columns: number) => {
  const bar = barCells(columns)
  const fixed = 2 + SYMBOL_CELLS + MESSAGE_CELLS + GO_CELLS + 3 + (bar > 0 ? bar + 1 : 0)
  return Math.max(6, columns - fixed - 1)
}

const shorten = (text: string, max: number) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// 進度條填滿比例：跑完 = 1；有 todo 清單用 完成數/總數；沒有清單 = -1（跑馬燈）
const fillOf = (entry: TaskEntry) => {
  if (entry.status === 'done') return 1
  if (entry.total === 0) return -1
  return Math.min(0.99, entry.done / entry.total)
}

const bar = (fill: number, at: number, width: number) => {
  if (fill < 0) {
    // 沒有 todo 清單：跑馬燈，表示還在動
    const pos = Math.floor(at / TICK_MS) % width
    return Array.from({ length: width }, (_, i) => (Math.abs(i - pos) < 2 ? '█' : '░')).join('')
  }
  const filled = Math.round(fill * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const register: Register = on => {
  let dir = ''
  let file = ''
  let me: TaskEntry | null = null
  let tasks = new Map<string, string>() // TaskCreate / TaskUpdate 的 id → status
  let tick = 0
  let askTimer: { cancel: () => void } | null = null
  // 回傳 true 代表狀態有變、要寫檔
  const flip = (waiting: boolean) => {
    if (me === null || me.waiting === waiting) return false
    me = { ...me, waiting }
    return file !== ''
  }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const home = (await $.env.get('HOME')) ?? ''
    dir = `${home}/.claude/task-progress`
    const id = await $.session.id()
    file = `${dir}/${id}.json`

    const found = await $.process.run(['sh', '-c', FIND_TTY])
    const [pidText, tty = ''] = found.stdout.trim().split(' ')

    me = {
      id,
      cwd: await $.session.cwd(),
      title: '',
      tty,
      pid: Number(pidText) || 0,
      status: 'done',
      startedAt: 0,
      finishedAt: 0,
      done: 0,
      total: 0,
      active: '',
      waiting: false,
    }
    await update($, selfId, () => id)

    const refresh = async () => {
      tick += 1
      const at = await $.clock.now()
      let list: TaskEntry[] = []
      try {
        const names = (await $.fs.list(dir)).filter(f => f.name.endsWith('.json'))
        for (const f of names) {
          try {
            list.push(JSON.parse(await $.fs.read(`${dir}/${f.name}`)) as TaskEntry)
          } catch {
            // 別的 session 正在寫，下一輪再讀
          }
        }
      } catch {
        list = []
      }

      // 每 5 輪檢查一次程序是否還活著，死掉的 session 清掉它的檔案
      if (tick % 5 === 1) {
        const pids = list.map(x => x.pid).filter(p => p > 0)
        if (pids.length > 0) {
          const ps = await $.process.run(['ps', '-o', 'pid=', '-p', pids.join(',')])
          const alive = new Set(ps.stdout.split('\n').map(s => Number(s.trim())))
          for (const x of list) {
            if (x.pid > 0 && !alive.has(x.pid) && x.id !== me?.id) {
              await $.process.run(['rm', '-f', `${dir}/${x.id}.json`])
            }
          }
          list = list.filter(x => x.pid === 0 || alive.has(x.pid) || x.id === me?.id)
        }
      }

      list = list
        .filter(x => x.title !== '')
        .filter(x => x.status === 'working' || at - x.finishedAt < DONE_TTL_MS)
        .sort((a, b) => a.startedAt - b.startedAt)

      await update($, entries, () => list)
      await update($, now, () => at)
    }

    void refresh()
    $.clock.every(TICK_MS, () => void refresh())

    return started
  })

  on('prompt.submit', async ($, e, next) => {
    if (me !== null && !e.text.startsWith('/')) {
      me = {
        ...me,
        cwd: await $.session.cwd(),
        title: shorten(e.text.split('\n')[0] ?? '', 120),
        status: 'working',
        startedAt: await $.clock.now(),
        finishedAt: 0,
        done: 0,
        total: 0,
        active: '',
        waiting: false,
      }
      tasks = new Map()
      if (file !== '') await $.fs.write(file, JSON.stringify(me))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // 「？」狀態：權限詢問、AskUserQuestion、ExitPlanMode 都在等你按
  // 權限詢問先等一下：自動模式會自己放行，放行了就不算在等你，免得每個指令都閃紅
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (me !== null && verdict.decision === 'ask' && e.agentId === undefined) {
      askTimer?.cancel()
      askTimer = $.clock.after(ASK_GRACE_MS, () => {
        askTimer = null
        if (flip(true)) void $.fs.write(file, JSON.stringify(me))
      })
    }
    return verdict
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    // 走到這裡代表已經放行了
    askTimer?.cancel()
    askTimer = null
    const isQuestion = e.tool === 'AskUserQuestion' || e.tool === 'ExitPlanMode'
    if (flip(isQuestion)) await $.fs.write(file, JSON.stringify(me))
    const ran = await next(e)
    if (flip(false)) await $.fs.write(file, JSON.stringify(me))
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (me !== null && e.agentId === undefined) {
      const todos = e.todos
      me = {
        ...me,
        done: todos.filter(t => t.status === 'completed').length,
        total: todos.length,
        active: todos.find(t => t.status === 'in_progress')?.activeForm ?? '',
      }
      if (file !== '') await $.fs.write(file, JSON.stringify(me))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const created = (ran.result as { task?: { id?: string } } | undefined)?.task?.id
    if (me !== null && e.agentId === undefined && created) {
      tasks.set(created, 'pending')
      me = { ...me, total: tasks.size }
      if (file !== '') await $.fs.write(file, JSON.stringify(me))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (me !== null && e.agentId === undefined && e.status !== undefined) {
      if (e.status === 'deleted') tasks.delete(e.taskId)
      else tasks.set(e.taskId, e.status)
      const all = [...tasks.values()]
      me = {
        ...me,
        done: all.filter(s => s === 'completed').length,
        total: all.length,
        active: e.status === 'in_progress' ? (e.activeForm ?? e.subject ?? me.active) : me.active,
      }
      if (file !== '') await $.fs.write(file, JSON.stringify(me))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const answered = await next(e)
    askTimer?.cancel()
    askTimer = null
    if (me !== null && e.agentId === undefined && me.status === 'working') {
      me = { ...me, status: 'done', waiting: false, finishedAt: await $.clock.now() }
      if (file !== '') await $.fs.write(file, JSON.stringify(me))
    }
    return answered
  })

  on('session.end', async ($, e, next) => {
    if (file !== '') await $.process.run(['rm', '-f', file])
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, entries)
    const self = await read($, selfId)
    const at = await read($, now)
    const columns = e.viewport?.columns ?? 80
    const room = titleCells(columns)
    const barWidth = barCells(columns)

    const focus = async (entry: TaskEntry) => {
      if (entry.id === self || entry.tty === '') return
      try {
        const r = await $.process.run(['/usr/bin/osascript', ...osa(FOCUS_TAB), entry.tty], { timeoutMs: 10000 })
        if (r.stdout.trim() !== 'ok') $.ui.toast('找不到那個 Terminal 分頁')
      } catch (err) {
        $.ui.toast(`跳轉失敗：${shorten(String(err), 80)}`)
      }
    }

    const openNew = async () => {
      $.ui.toast('正在開新對話…')
      try {
        const cwd = me?.cwd || (await $.session.cwd())
        const r = await $.process.run(['/usr/bin/osascript', ...osa(NEW_SESSION), cwd], { timeoutMs: 10000 })
        if (r.exitCode !== 0) $.ui.toast(`開新對話失敗：${shorten(r.stderr, 80)}`)
      } catch (err) {
        $.ui.toast(`開新對話失敗：${shorten(String(err), 80)}`)
      }
    }

    return (
      <Box flexDirection="column" backgroundColor={BG} paddingX={1}>
        {list.map(entry => {
          const isDone = entry.status === 'done'
          const isSelf = entry.id === self
          const color = colorOf(entry)
          const message = entry.waiting ? '等你確認' : isDone ? '完成' : entry.active || '進行中'
          return (
            <Box key={entry.id} flexDirection="row" gap={1} backgroundColor={BG}>
              <Box width={SYMBOL_CELLS} flexShrink={0}>
                <Text color={color} backgroundColor={BG} bold={entry.waiting} wrap="truncate-end">
                  {entry.waiting ? '？' : '●'}
                </Text>
              </Box>
              <Box width={MESSAGE_CELLS} flexShrink={0}>
                <Text color={color} backgroundColor={BG} wrap="truncate-end">
                  {message}
                </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1} minWidth={6}>
                <Text color={color} backgroundColor={BG} wrap="truncate-end">
                  {isSelf ? `${fitCells(entry.title, room - 10)}（此視窗）` : fitCells(entry.title, room)}
                </Text>
              </Box>
              {barWidth > 0 ? (
                <Box width={barWidth} flexShrink={0}>
                  <Text color={color} backgroundColor={BG} wrap="truncate-end">
                    {bar(fillOf(entry), at, barWidth)}
                  </Text>
                </Box>
              ) : null}
              <Box width={GO_CELLS} flexShrink={0}>
                {isSelf ? (
                  <Text backgroundColor={BG}> </Text>
                ) : (
                  <Button key={`go-${entry.id}`} label="前往→" plain onPress={() => focus(entry)} />
                )}
              </Box>
            </Box>
          )
        })}
        <Box flexDirection="row" backgroundColor={BG}>
          <Button key="new-session" label="＋ 開新對話" plain onPress={() => openNew()} />
        </Box>
      </Box>
    )
  })
}
