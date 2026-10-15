<h1 align="center">test-pulse</h1>

<p align="center">
  A live test-health dashboard for `npm test`:<br/>
  pass/fail history, a push gate, and a real panel - not just a toast.
</p>

---

## Why this matters

**Code that looks done and code that's actually been tested are not the same thing, and it's easy to lose track of which one you're looking at mid-session.** When an agent, or you moving fast, is making changes across several files, "did the tests pass after that last edit" is a question that's cheap to skip and expensive to be wrong about once it's pushed.

test-pulse keeps the answer visible instead of implicit. It remembers the last real result, surfaces it in a real panel instead of a toast you glance past, and refuses `git push` outright when that last recorded run failed, with the reason and how long ago it failed.

**One honest limit:** the push gate only sees `git push` run as a Bash tool call inside Claude Code, and it only knows about runs it actually recorded. It protects your agent-driven workflow, not a `git push` you type directly in your own terminal, and it has nothing to say about a test suite it never saw run.

## What it does

Three things, working off the same history:

1. **Tracks every test run** - whether you ran `npm test` by hand or hit the
   dashboard's button - as pass/fail + duration, kept across sessions.
2. **Gates `git push`**: if the last recorded run failed, the push is refused
   outright, with the reason and how long ago it failed. No history at all
   (tests never run this session) is never itself a reason to block - only a
   known failure is.
3. **Opens a real panel** with `/test-pulse`: the detected test command, the
   last result, a dot-per-run history strip, and a "Run tests now" button
   that re-runs them and redraws live - not a toast, an actual docked
   interactive pane.

```
$ /test-pulse

┌ Test Pulse ──────────────────────────────┐
│ npm test                                  │
│ ✔ passing · 4m ago · took 2.3s            │
│ ●●●●✕●●  last 7 runs                      │
│ [ Run tests now ]                         │
└────────────────────────────────────────────┘
```

## Install

```
/plugin install test-pulse --marketplace thisismairaj/test-pulse
```

Works on any project with a real `"test"` script in `package.json` (not
npm's default `"echo \"Error: no test specified\" && exit 1"` placeholder,
which is treated as no test command configured). No other setup.

## How it works

Five hooks, each doing one job:

- **`session.start`** registers the `/test-pulse` slash command.
- **`command.run`** on `test-pulse` opens the dashboard as a real `Pane`
  (`$.ui.open`), not a toast - a docked panel the engine places and this
  plugin draws.
- **`tool.call` on Bash** (observer) times and records any command that
  matches the detected test command, so running tests by hand keeps the
  history current, not just the panel's own button.
- **`tool.call` on Bash** (a real gate, with `.catch`) refuses `git push`
  outright when the last recorded run failed - the push never executes.
- **`ui.render` on `{ component: 'Pane', requestId: 'test-pulse' }`** draws
  the panel itself: history, last result, and a Button whose `onPress` calls
  `$.tool.call` to actually re-run the tests, then `$.ui.invalidate` to
  redraw with the new result.

History lives in `$.store` (JSON, kept across sessions and hot reloads), the
last 15 runs. The push gate fails open on its own errors - a bug in this
plugin should never be the reason `git push` stops working.

## Development

Built and iterated inside a live Claude Code session using a dev-mod's hot
reload - see [token-weather](https://github.com/thisismairaj/token-weather)
for more on that workflow. No build step; the hooks module runs directly as
TypeScript/JSX.

```bash
claude plugin validate .
```

## License

MIT
