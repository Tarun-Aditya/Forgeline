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
  for `approve-spec`, `respec`, `approve`, `rework`, `accept` and `resume`. A card whose
  agent stopped to ask something shows a "needs your answer" badge, the agent's last message
  and a reply box (also in the job dialog and the Agents view); the answer resumes that same
  session with `claude -p "<answer>" --resume <session-id>` and shows in the chat.
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
- A job "needs your answer" when the latest web run on it ended with a result and either left
  the job mid-loop (`spec`, `plan`, `build`, `review`, `approve`) or was a job command that did
  not move it. Only runs started here are covered. There is no dismiss; a newer run on the job
  clears it. An answer run's prompt in Runs is the answer text.
- The streamed run log and cost exist only for runs started here. Jobs driven from a terminal,
  the desktop app or VS Code still appear on the board and in Activity, through their files
  and the hook-written log (see USAGE.md 7a).
- The API answers only to `localhost` and refuses cross-origin writes, because it can start agents.
- Agents still never merge, push or deploy on their own; "Approve merge" runs `/factory approve`.
- Cost on a subscription login is API-equivalent, not a bill.
