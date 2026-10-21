# Forgeline web

A local web layer over the factory. It does not replace the orchestrator: every action
launches `claude -p "/factory ..."` in the chosen repo, exactly as you would type it, and
job state is still written by `factory/scripts/jobctl.py` into `factory/jobs/`.

Built with Next.js, the Vercel AI SDK (`ai`, `@ai-sdk/react`) and AI Elements.

## Run

```bash
cd web
npm install
npm run dev        # http://127.0.0.1:3000
npm test           # node:test, no extra tooling
```

Needs Node 22+ and the `claude` CLI logged in. It binds to `127.0.0.1` only.

## What it does

- **Input box**: a description, pasted ticket text, or a Jira key (`ABC-123`) starts a job.
  Text starting with `/factory` runs as typed. The Feature / Bug fix toggle adds
  `--type bugfix`; the Ticket field adds `--ticket KEY`.
- **Live run log**: the `stream-json` output of the run, shown with AI Elements
  (messages, reasoning, tool calls with input and output, cost line).
- **Activity**: the shared hook-written log (`factory/scripts/activity.py`), so it also shows
  jobs driven from the CLI, desktop app or VS Code. Sessions are running, idle, ended,
  stalled or crashed; a stalled one shows the `/factory resume` command. Board cards get a running dot
  or a red "stalled" / "crashed" badge from the same data.
- **Runs**: every run started here, with status (running, ok, failed, lost), cost and its
  `claude --resume <session-id>` command. Click one to replay its log, and follow it live if
  it is still running. This works after a page refresh or a web server restart.
- **Board**: the factory's stages as columns, read from `factory/jobs/*/job.json` every 2s.
  Click a card to read its markdown files. At the human gates the dialog has the buttons
  for `approve-spec`, `respec`, `approve`, `rework`, `accept` and `resume`.
- **Code changes**: the code a job changed, inside the job. Open a card and click **Code changes** (or the
  "code changes" entry in the files dialog). It lists the changed files grouped by folder (code first, then tests,
  then the record the factory wrote under `factory/audit/` and `docs/`) with line counts and the job's commits.
  Each file opens as a **Diff** (side by side or inline) or as the finished **Code**, with the lines the job added
  marked in green. It follows the job's branch while it exists and its merge commit afterwards. The editor is
  Monaco (the engine behind VS Code), served from `/monaco` (copied from `node_modules` by `scripts/copy-monaco.mjs`),
  so it works offline. The API is read-only git: `GET /api/jobs/<id>?repo=...&changes=1` for the list and
  `&file=<path>` for one file before and after; only files in the job's own change can be requested.
- **Repo picker**: repos listed in `FORGELINE_REPOS` (path-separated), or `web/.data/repos.json`,
  or this repo by default. A repo needs `factory/policy.json` and `.claude/agents/`.
- **MCP servers**: names from your existing Claude config (`~/.claude.json`, `.mcp.json`)
  as on/off toggles. Server configs never reach the browser; turning one off runs the job
  with `--strict-mcp-config` and only the servers left on.
- **Metrics**: jobs merged, first-pass and escalation rates (from `metrics.py`), plus cost,
  tokens and runs by model, job and day, from the result event of each run.

## Settings (environment)

| Variable | Default | Meaning |
| --- | --- | --- |
| `FORGELINE_REPOS` | this repo | Repos the app may use. |
| `FORGELINE_PERMISSION_MODE` | `auto` | Passed as `--permission-mode`. |
| `FORGELINE_ALLOW_API_KEY` | unset | By default `ANTHROPIC_API_KEY` is removed so runs use the subscription. |
| `CLAUDE_BIN` | `claude` | Path to the CLI. |
| `FORGELINE_WEB_DATA` | `web/.data` | Run history and event logs. |

## Behaviour to know

- Runs are detached `claude -p` processes writing to `web/.data/runs/<id>.jsonl`. Closing the
  browser or killing the web server does not stop them; the Stop button does (SIGINT). On the
  next request the server settles runs that ended meanwhile. A process that vanished without
  a result is recorded as **lost**; continue its job with `/factory resume <job-id>`.
- One run per job at a time; a second command for the same job is refused.
- The streamed run log and cost exist only for runs started here. Jobs driven from a terminal,
  the desktop app or VS Code still appear on the board and in Activity, through their files
  and the hook-written log (see USAGE.md 7a).
- The API answers only to `localhost` and refuses cross-origin writes, because it can start agents.
- Agents still never merge, push or deploy on their own; "Approve merge" runs `/factory approve`.
- The agent process gets the web server's environment **minus** `ANTHROPIC_API_KEY`, `NODE_ENV` and Next's own variables
  (`agentEnv()` in `lib/runner.ts`). The server runs with `NODE_ENV=production`; passed on, it made a repo's tests fail
  differently from a normal shell (React's `act()` fails under production), so the merge gate saw a red baseline.
- Cost on a subscription login is API-equivalent, not a bill.

## Demo videos

`demo/` records narrated Playwright videos of this app. `demo/record-sample.mjs` (run with `demo/run-sample-demo.sh`) is the
feature demo: a small GraphQL + React app before, Forgeline building a feature in it (a replay of a real job), the app
after, then a code walkthrough of the real diffs. See `demo/README.md` for how the script, the Piper voice-over, the
sync and the gaps work, and `.claude/skills/record-demo/SKILL.md` for the full procedure and lessons. The final cut is
`demo/videos/forgeline-sample-demo.mp4`.

## UI structure

The shell follows the patterns of Mastra Studio's design system, rewritten here (no Mastra code is copied):

- `app/globals.css`: surface ladder (`surface-1..3`, `sidebar`) and status tokens (`ok`, `warn`, `call`, `info`, `destructive`).
- `components/status.tsx`: one status vocabulary (`StatusBadge`, `StatusDot`) and the header `ActivityBelt` (working / waiting on you / trouble / all quiet).
- `components/page-layout.tsx`: shared page header with breadcrumbs and actions.
- `components/pipeline.tsx`: the job's stages as a done / current / upcoming pipeline, shown in the job dialog.
- `components/command-palette.tsx`: ⌘K / Ctrl+K to jump to a view or a job.
- Layout follows Studio: the chat is its own **New job** page (centre of the card), the right side panel is context for the selected job on the Board (`components/job-panel.tsx`), and Runs is the thread list.
- **Agents** lists the repo's subagents (`GET /api/agents`, read-only, from `.claude/agents/*.md`) with live working/idle from the shared activity log; selecting one opens its details in the right panel.
- Motion follows Studio: colour-only hover transitions, 200ms eased dialogs, streamed content fades in through an arrival scope (restored logs do not), and the side panel eases in. All of it is off under `prefers-reduced-motion`.
- The Agents page opens in a **pipeline view**: agent tiles with icons laid out in factory order (Intake → Plan → Build → Review → Decide), working agents pulse, and the links between lanes animate while either side is active. A toggle switches to the table.
- **Job switcher.** A strip under every page header lists the parallel jobs (waiting-on-you first, then running). Picking one scopes the whole app to it, and the choice is remembered: Board opens its panel, Agents shows only what touched that job (others dimmed), Activity and Runs filter to it, Metrics shows its cost, and New job shows its stage actions above the composer. "All jobs" clears it.
