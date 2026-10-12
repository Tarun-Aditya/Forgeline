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
npm run e2e        # Playwright tests with video (see e2e/README.md)
```

Needs Node 22+ and the `claude` CLI logged in. It binds to `127.0.0.1` only.

## What it does

- **Input box**: a description, pasted ticket text, or a Jira key (`ABC-123`) starts a job.
  Text starting with `/factory` runs as typed. The Feature / Bug fix toggle adds
  `--type bugfix`; the Ticket field adds `--ticket KEY`.
- **Several runs at once**: the input stays free while a run goes. The right-hand panel lists your
  runs; click one to follow it. Locking is per job, not per tab. On a phone a "New task" button opens
  the same panel as a sheet.
- **Live run log**: the `stream-json` output of the run, shown with AI Elements
  (messages, reasoning, tool calls with input and output, cost line). A tool error the agent
  recovers from by itself ("file not read yet") shows as a quiet "Retried" line, not red.
- **Activity**: the shared hook-written log (`factory/scripts/activity.py`), so it also shows
  jobs driven from the CLI, desktop app or VS Code. Sessions are running, idle, ended,
  stalled or crashed; a stalled one shows the `/factory resume` command. Board cards get a running dot
  or a red "stalled" / "crashed" badge from the same data.
- **Runs**: every run started here, with status (running, ok, failed, lost), cost and its
  `claude --resume <session-id>` command. Click one to replay its log, and follow it live if
  it is still running. This works after a page refresh or a web server restart.
- **Agents**: one job as a flow of role icons. The agent working glows and shows what it is doing in
  plain words ("Editing index.js", "Running tests"); a dot travels along the line at each hand-off;
  the lines carry what was passed on ("spec: 13 acceptance criteria", "PASS"); each node shows its
  estimated cost. A finished job replays (play, pause, scrub); a running one is live. The same job card and
  action buttons as the Board sit above it. Timeline is the bar-chart view; Compare puts two jobs
  side by side (time, tool calls, cost per agent).
- **Code changes**: in the job dialog, the diff of the job branch (or its merge commit once merged)
  and the checks the builder says it ran.
- **Alerts**: the tab title counts what needs you. The bell turns on a sound and a browser
  notification, while the tab is in the background, when a job reaches a human step, stalls or
  crashes, or an agent asks a question.
- **Repo notes**: above the input, warnings that explain stuck jobs: uncommitted changes (the merge
  gate refuses a dirty checkout), a branch other than `main`, no `AGENTS.md`/`CLAUDE.md`, no
  `verify_commands`, or that the repo is Forgeline itself.
- **Theme and keys**: system, light or dark. `g b/a/c/r/m` switch tab, `n` focuses the task box,
  `?` lists them.
- **Board**: the factory's stages as columns, read from `factory/jobs/*/job.json`.
  Click a card to read its markdown files. At the human gates the dialog has the buttons
  for `approve-spec`, `respec`, `approve`, `rework`, `accept` and `resume`. A card whose
  agent stopped to ask something shows a "needs your answer" badge, the agent's last message
  and a reply box (also in the job dialog and the Agents view); the answer resumes that same
  session with `claude -p "<answer>" --resume <session-id>` and opens in the Runs panel.
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
| `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` | `0` for runs started here | `claude -p` stops background agents 10 minutes after its last turn, which killed long builds. `0` waits for them. |

## Behaviour to know

- Runs are detached `claude -p` processes writing to `web/.data/runs/<id>.jsonl`. Closing the
  browser or killing the web server does not stop them; the Stop button does (SIGINT). On the
  next request the server settles runs that ended meanwhile. A process that vanished without
  a result is recorded as **lost**; continue its job with `/factory resume <job-id>`.
- One run per job at a time; a second command for the same job is refused. Runs on different jobs
  can go together, but jobs that edit the same files can conflict when they merge.
- The browser gets changes pushed over one server-sent-events connection (`/api/events`, watching
  `factory/jobs`, `factory/activity` and the run folder) and refetches at once. If it drops, polling
  resumes every 2 to 3 seconds. The header shows "live" or "polling".
- Cost per agent is an estimate: each model's real cost for a web run is split across agents by their
  token use. It adds up to the run's cost, but it is not billed per agent. Sessions from elsewhere are
  added from their transcripts (see above).
- An agent whose session is no longer running is never shown as live, and a merged job is never
  shown as running (the activity log tags any session that touches a job's files).
- A job "needs your answer" when the latest run or session on it ended with a final message and either
  left the job mid-loop (`spec`, `plan`, `build`, `review`, `approve`) or, for a web run, was a job command
  that did not move it. This covers web runs and sessions started in the terminal, VS Code or desktop: those
  count when they ended cleanly (a `session_end` in the activity log) on text rather than a tool call,
  with nobody else working on the job. A killed session is "crashed", not a question. Answering resumes
  that session with `claude -p --resume <session-id>`, so only answer a session you are not still using.
  There is no dismiss; a newer run or session on the job clears it.
- **Sessions from elsewhere**: the activity log (hooks) names the sessions and their jobs, and Claude Code's own
  transcripts (`~/.claude/projects/<repo>/<session>.jsonl`, with each subagent in `<session>/subagents/`) say
  where each ran, what it was about and what it spent. They are listed in the side panel with a source badge
  (terminal, VS Code, desktop). The web app has no text log of them, so opening one shows the steps the hooks
  recorded and the `claude --resume` command. Their cost is an estimate: tokens from the transcript, priced
  per model from what web runs of that model cost. Against web runs it lands at roughly 70 to 100 percent of
  the real cost, usually a little low. A session counts toward a job only if it began with `/factory` or ran
  factory subagents, because the activity log ties any session that mentions a job to it. A person's own
  `claude -p` run is marked like a web run (`sdk-cli`) and is not listed.
- The live streamed log exists only for runs started here. Jobs driven from a terminal, the desktop app or VS
  Code appear on the board, in Activity and in the Agents view through their files and the hook-written log
  (see USAGE.md 7a).
- The API answers only to `localhost` and refuses cross-origin writes, because it can start agents.
- Agents still never merge, push or deploy on their own; "Approve merge" runs `/factory approve`.
- Cost on a subscription login is API-equivalent, not a bill.
