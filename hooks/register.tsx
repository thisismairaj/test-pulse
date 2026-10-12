import type { Register } from 'claude-code'

const PANE_ID = 'test-pulse'
const HISTORY_KEY = 'history'
const MAX_HISTORY = 15

type Run = { pass: boolean; durationMs: number; at: string }

async function detectTestCommand($: any): Promise<string | null> {
  try {
    const raw = await $.fs.read('package.json')
    const pkg = JSON.parse(raw)
    const script = pkg?.scripts?.test
    if (typeof script !== 'string' || script.length === 0) return null
    if (/no test specified/i.test(script)) return null
    return 'npm test'
  } catch {
    return null
  }
}

async function recordRun($: any, pass: boolean, durationMs: number) {
  const history = ((await $.store.get(HISTORY_KEY)) as Run[] | undefined) ?? []
  const updated = [...history, { pass, durationMs, at: new Date().toISOString() }].slice(-MAX_HISTORY)
  await $.store.set(HISTORY_KEY, updated)
}

async function runTestsNow($: any, command: string) {
  const start = Date.now()
  const res = await $.tool.call({ tool: 'Bash', command })
  const pass = !(res && typeof res === 'object' && 'isError' in res && res.isError)
  await recordRun($, pass, Date.now() - start)
  $.ui.invalidate('ui.render')
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.round(mins / 60)}h ago`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'test-pulse',
      description: 'Open the test-health dashboard.',
    })
    return next(e)
  })

  on('command.run', { command: 'test-pulse' }, async ($, e, next) => {
    const opened = await $.ui.open({ id: PANE_ID, title: 'Test Pulse', closeOnEscape: true })
    return {
      text: opened.isPlaced
        ? 'Opened the test-health dashboard.'
        : 'Widen the terminal to see the test-pulse dashboard.',
    }
  })

  // Record a run whenever the project's own test command happens to be run
  // by hand too, not only from the dashboard's button, so the history stays
  // current no matter how the tests actually got run.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = (e as { command?: string }).command
    const testCommand = await detectTestCommand($)
    const isTestRun = testCommand !== null && typeof command === 'string' && command.trim() === testCommand

    const start = Date.now()
    const res = await next(e)

    if (isTestRun) {
      try {
        const pass = !(res && typeof res === 'object' && 'isError' in res && res.isError)
        await recordRun($, pass, Date.now() - start)
      } catch {
        // never let history-tracking affect the real test result
      }
    }

    return res
  })

  // A real gate: refuses `git push` outright when the last recorded test
  // run failed. No history at all (tests never run this session) is not
  // itself a reason to block - only a known failure is.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = (e as { command?: string }).command

    if (typeof command === 'string' && /\bgit\s+push\b/.test(command)) {
      try {
        const history = ((await $.store.get(HISTORY_KEY)) as Run[] | undefined) ?? []
        const last = history[history.length - 1]
        if (last && !last.pass) {
          return {
            deny:
              `test-pulse: the last recorded test run failed (${timeAgo(last.at)}). ` +
              'Fix it, or run the tests again and let them pass, before pushing. ' +
              'Open /test-pulse to see the history.',
          }
        }
      } catch {
        // scanning failed - never block a push over our own bug
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e, next) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const history = ((await $.store.get(HISTORY_KEY)) as Run[] | undefined) ?? []
    const testCommand = await detectTestCommand($)
    const last = history[history.length - 1]

    if (testCommand === null) {
      return (
        <Box flexDirection="column">
          <Text bold>Test Pulse</Text>
          <Text dimColor>No "test" script found in this project's package.json.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text bold>Test Pulse</Text>
        <Text dimColor>{testCommand}</Text>
        <Text> </Text>
        {last ? (
          <Text color={last.pass ? 'green' : 'red'}>
            {last.pass ? '✔ passing' : '✘ failing'} &middot; {timeAgo(last.at)} &middot; took{' '}
            {(last.durationMs / 1000).toFixed(1)}s
          </Text>
        ) : (
          <Text dimColor>No runs recorded yet.</Text>
        )}
        {history.length > 0 && (
          <Text>
            {history.map((run, i) => (
              <Text key={`run-${i}`} color={run.pass ? 'green' : 'red'}>
                {run.pass ? '●' : '✕'}
              </Text>
            ))}
            <Text dimColor> last {history.length} run{history.length === 1 ? '' : 's'}</Text>
          </Text>
        )}
        <Text> </Text>
        <Button
          key="run-now"
          variant="primary"
          onPress={() => {
            void runTestsNow($, testCommand)
          }}
        >
          Run tests now
        </Button>
      </Box>
    )
  })
}
