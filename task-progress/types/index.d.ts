export type TaskEntry = {
  id: string
  cwd: string
  title: string
  tty: string
  pid: number
  status: 'working' | 'done'
  startedAt: number
  finishedAt: number
  done: number
  total: number
  active: string
  waiting: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'task-progress': { entries: TaskEntry[]; selfId: string; now: number }
  }
}
