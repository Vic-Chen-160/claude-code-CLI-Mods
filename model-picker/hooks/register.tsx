import type { Register } from 'claude-code'

// 提示行（⏵⏵ auto mode on …）右端放 Model ↑ 按鈕，
// 按下等同輸入 /model：叫出原生的模型＋思考努力程度選單。
// 提示行改由本 mod 自己畫：原生文字照抄，模式名稱照原生配色上色。
const LABEL = 'Model ↑'
// 與 task-progress 那條 session 帶同一個灰底
const BG = '#E6E6E6'
// 標籤字數固定（Model ↑ 共 7 格），再加左右 padding 各 1
const CHIP_CELLS = 7 + 2

// 模式名稱（「… on」為止）的顏色，比照原生淺色主題
const MODE_COLORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/auto mode/, '#966C1E'],
  [/accept edits/, '#8700FF'],
  [/plan mode/, '#006666'],
  [/bypass permissions/, '#AB2B3F'],
]

export const register: Register = on => {
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const hint = e.props.hint
    const match = /^(.*? on)(\s.*)?$/.exec(hint)
    const color = match ? MODE_COLORS.find(([re]) => re.test(match[1]))?.[1] : undefined

    return (
      <Box flexDirection="row" flexWrap="nowrap">
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          {match && color ? (
            <Text wrap="truncate-end">
              <Text color={color}>{match[1]}</Text>
              <Text dimColor>{match[2] ?? ''}</Text>
            </Text>
          ) : (
            <Text dimColor wrap="truncate-end">{hint}</Text>
          )}
        </Box>
        <Box width={CHIP_CELLS} flexShrink={0} paddingX={1} backgroundColor={BG}>
          <Button key="model-picker" plain label={LABEL} onPress={() => void $.command.run({ command: 'model' })} />
        </Box>
      </Box>
    )
  })
}
