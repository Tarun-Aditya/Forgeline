# Agent questions on the job card

> Feature: Show agent questions on the job. When an agent stops to ask something, like the "which repo?" refusal, it shows only in the right-hand chat, so the job looks stuck. A "needs your answer" badge and a reply box on the job card would fix that. This is the biggest gap.

- Ticket: none
- Risk: medium. It changes two web API contracts and starts `claude -p --resume` runs from a new input, but it stays inside `web/`, is local-only behind the existing guard, and touches no frozen or escalate path.

## Context

All of this is in the web layer, `web/`. The factory scripts and prompts do not change.

- **How a run works today.** `web/lib/runner.ts` `launchRun()` starts a detached `claude -p "<prompt>" --output-format stream-json ...` in the repo and writes `RunMeta` (`web/lib/runs.ts`: `runId`, `repo`, `prompt`, `key`, `pid`, `startedAt`, `before`) to `web/.data/runs/<id>.meta.json`. The output goes to `<id>.jsonl`. `key` is the job a `/factory <verb> <job-id>` command acts on (`jobKey()`). When the process ends, `finalize()` appends a `RunRecord` to `runs.jsonl` with `jobIds` (the key plus any jobs created during the run) and the cumulative `RunResult` from `EventMapper` (`web/lib/stream.ts`). `activeRuns()` lists live runs and refuses a second run for the same job.
- **What "the agent stopped to ask" looks like.** A `claude -p` run cannot wait for input. The orchestrator stops by ending the run, and its last message is the `result` string of the final `result` stream-json event. `EventMapper` does not keep that string today. The real "which repo?" case is in `web/.data/runs/` of the main checkout. Run `mv5cceyq-gidp` was `/factory accept 001-limit-has-pending`. It ended with "I haven't accepted job `001-limit-has-pending` yet. It's still at `intent`, and I stopped because the intent has an open question…", and the job stayed at `intent` with its `history` unchanged. The board kept showing the normal "Accept intent" button, so the job looked stuck.
- **How a person answers today.** The chat panel (`web/components/run-panel.tsx`, wired in `web/components/app-shell.tsx` through `useChat` and `POST /api/chat`, `web/app/api/chat/route.ts`) sends every message as a new run. Plain text goes through `buildPrompt()` and becomes `/factory <text>`, which is a new job. Only a typed `/factory accept <id> …` style command acts on the existing job. The stopped session itself is never continued. Its session id is known (`RunRecord.sessionId`, or `parseLog(id).sessionId`), and the Runs view prints `claude --resume <id>` for a person to copy.
- **Where jobs are shown.**
  - `web/components/board.tsx` `JobCard`: the whole card is one `<button>` that opens the drawer, with a "your call" badge for `spec-approval` and `needs-human`.
  - `web/components/job-drawer.tsx` `JobDrawer`, which holds `Actions`, `useJobCommand` (the one-click lock) and `WorkingBanner`.
  - The current-job panel in `web/components/agents-view.tsx`.
  - The Board tab count `needMe` in `app-shell.tsx`.
  - `GET /api/jobs` (`web/app/api/jobs/route.ts`) returns `{ jobs, stages, active }`, and the client polls it every 2 s (`usePoll`).
  - "Running" on the client also comes from activity-log sessions (`running` set in `app-shell.tsx`).
- **Patterns to reuse.**
  - `Badge` (`web/components/ui/badge.tsx`) with the `bg-call text-white` style used for "your call".
  - `Textarea` (`web/components/ui/textarea.tsx`) and `Button`.
  - `MessageResponse` (`web/components/ai-elements/message.tsx`) to render markdown.
  - `useJobCommand` for locking.
  - The `node:test` suites in `web/tests/`, which fake the CLI with a `CLAUDE_BIN` shell script (`web/tests/runs.test.ts`).
- There is no `docs/GLOSSARY.md` and no `docs/adr/`. `factory/out-of-scope.md` lists nothing related.

## Design

The change is architectural: it adds a server module, changes the `/api/jobs` response and the `/api/chat` request contract, and adds fields to the stored run metadata and run record.

**Decision.** The web server works out which jobs are waiting on a person from data it already owns: its own run files and `job.json`. When a web run on a job has ended with a result, and it left the job in a state the board has no next step for, that run's final message is the job's pending question. `GET /api/jobs` returns these questions. The board card, the job drawer and the Agents panel show a "needs your answer" badge, the question text and a reply box. The reply continues the same Claude session with `claude -p "<answer>" --resume <session-id>`, so the orchestrator that asked gets the answer with its full context, at any stage. The reply goes through the same `useChat` stream as the chat panel, so it appears in the chat as well, and the chat and the card stay one conversation. A newer run on the job replaces the question, whether it came from the card or the chat, so the badge clears.

A run's final message is a pending question for job J when all of these hold:
1. The run is the most recent web run for J by `startedAt`. A run counts for J when its `key` is J or its record's `jobIds` contains J. A run that is still alive and whose `before` list does not contain J also counts for J.
2. Its process has ended, its log has a `result` event whose `is_error` is false, and the final `result` text is not empty. Lost and failed runs are excluded.
3. No live web run counts for J.
4. J is not `paused`, and J's stage is not `merged`, `split` or `needs-human`.
5. One of these is true:
   - (a) J's stage is `spec`, `plan`, `build`, `review` or `approve`. The loop moves through these on its own, so a run that ended there stopped for the person.
   - (b) The run acted on J (its `key` is J, or it was an answer to J), and J's `history` has the same number of entries as when the run started. The command did not move the job. This is the "which repo?" case.

**Alternatives considered.**
- *The orchestrator declares the question.* For example, a `jobctl.py ask` command or a `QUESTION:` line required by `.claude/skills/factory/SKILL.md`, stored in `job.json`. Not chosen: `factory/scripts/**` and `.claude/**` are frozen paths in `factory/policy.json`, so the factory cannot build this job that way. It would also depend on every prompt following a new rule, which only the live agent evals can check.
- *Detect questions from the text* (the last message ends with "?" or contains "question"). Not chosen: it is fragile. The real "which repo?" message does not end with "?", and normal gate messages ("read intent.md and run /factory accept") also ask the person something.
- *Answer by running a new `/factory accept <id> <answer>` command* instead of resuming. Not chosen: there is no verb for a stop mid-loop (`spec`, `plan`, `build`, …), and a new session loses what the stopped orchestrator found.
- *Read questions from the activity log's `stop` events* (`factory/scripts/activity.py`, which covers every surface). Not chosen: the text is clipped to 300 characters, the script is frozen, and a session started in a terminal or IDE is answered in that surface.

**Consequences.**
- Easier: any web-started stop that leaves a job without a next step shows up on the job and can be answered there, with no prompt change.
- Harder: the rule depends on the stage names in `web/lib/jobs.ts` `STAGES` and on `job.json` `history`. If the orchestrator adds a stage, the rule must be checked.
- Jobs driven only from a terminal, the desktop app or VS Code have no web run, so they get no badge.
- Runs recorded before this change have no start snapshot, so only rule (a) applies to them.
- An answer run's `prompt` in the Runs view is the answer text, not a `/factory` command.

**Interfaces.**
- `web/lib/questions.ts` (new):
  - `export type Question = { job: string; runId: string; sessionId: string; text: string; askedAt: string }` (`askedAt` is the run's `endedAt`)
  - `export function pendingQuestions(repo: string, jobs: Job[]): Record<string, Question>`
- `RunMeta` gains `answers?: string` (the job id an answer run answers) and `at?: { job: string; stage: string; history: number }` (J's stage and `history.length` at launch, written whenever the run has a key or answers a job).
- `RunRecord` gains `finalText?: string`: the last `result` event's `result` string, clipped to 8000 characters. `EventMapper` gains a public `finalText: string | undefined`.
- `StartInput` gains `answer?: string` (a job id). When it is set, `launchRun` does the following:
  - It refuses unless `pendingQuestions` has a question for that job. Error: `Job <id> is not waiting on an answer.`
  - It uses the trimmed text verbatim as the prompt, without `buildPrompt`, and refuses empty text.
  - It adds `--resume <question.sessionId>`, sets `key` to the job id and `answers` to the job id, and keeps the one-run-per-job refusal.
- `POST /api/chat` body gains `answer?: string`.
- `GET /api/jobs` response gains `questions: Record<string, Question>`.

## Requirements

1. Add `web/lib/questions.ts` with `pendingQuestions()` that implements the rule in Design exactly, using `listMeta()`, `loadRuns()` and the `job.json` data passed in. For a finished run with no `finalText` (recorded before this change), read the text and session id from `parseLog()`. Only parse the one run selected per job, not every run.
2. `EventMapper` keeps the last `result` event's `result` string as `finalText`. `finalize()` stores it, clipped to 8000 characters, as `RunRecord.finalText`.
3. `launchRun()` writes `RunMeta.at` for the job the run acts on (its `key`, or the answered job), and `answers` for an answer run.
4. `launchRun()` supports `answer` as described under Interfaces. Plain chat messages without `answer` behave exactly as today.
5. `POST /api/chat` passes `answer` through. `GET /api/jobs` returns `questions`.
6. Board (`board.tsx`):
   - A job card with a pending question shows a "needs your answer" badge in the header, styled like "your call" (`bg-call text-white`). The card border uses the `border-call/60` highlight.
   - Below the existing card content, the card shows the question text rendered with `MessageResponse` in a box limited to about 12rem high that scrolls, with a reply `Textarea` and a "Send answer" `Button`.
   - The card must not nest the reply box inside the clickable `<button>`: restructure the card so that the open-the-drawer button and the question section are siblings.
   - Pressing Enter in the reply box does not open the drawer.
7. Job drawer (`job-drawer.tsx`) and the current-job panel in `agents-view.tsx` show the same badge, question text and reply box for the open job. Use one shared component, for example `QuestionBox` in a new `web/components/question-box.tsx`.
8. The reply box disables "Send answer" while the text is empty, while this tab has a run streaming, or while the job is running (the `running` set or the drawer's `working`). After sending it shows `WorkingBanner` like the existing commands. Reuse `useJobCommand`'s locking rather than a new lock.
9. `app-shell.tsx` gets an `answer(jobId, text)` callback.
   - It calls `sendMessage({ text }, { body: { repo, answer: jobId, mcp } })` with the same MCP selection as `submit`.
   - It does not set the "Starting a new job…" placeholder.
   - The answer appears in the chat panel as a user message, and its run streams there.
10. While a job's id is in the client `running` set, its badge and reply box are hidden.
11. The Board tab count (`needMe`) also counts jobs with a pending question, and counts each job at most once.
12. A question has no dismiss control. It clears only when a newer run counts for the job, whether that run came from the card or the chat.
13. Tests in `web/tests/` (node:test, a fake `CLAUDE_BIN` like `runs.test.ts`) cover every acceptance criterion marked "test" below.
14. Docs:
    - `web/README.md` "What it does" (Board bullet) and "Behaviour to know" describe the badge, the reply box, the rule in one or two sentences, and that only web-started runs are covered.
    - `USAGE.md` section 7b gets one sentence saying the same.

## Acceptance criteria

All "test" items run with `cd web && npm test`, which must pass. Each one creates a temp repo with `factory/jobs/<id>/job.json` and fake runs written through `writeMeta` and the event log, or through `launchRun` with a fake `CLAUDE_BIN`.

1. Test: J is at `intent`, with history of 1 entry. A finished run with `key` J and `at.history` 1 ended with result "Which repo?". `pendingQuestions(repo, jobs)[J]` has `text` "Which repo?", the run's `sessionId`, and that `runId`.
2. Test: the same as 1, but `job.json` history now has 2 entries. There is no question for J.
3. Test: J is at `build`, not paused, and its latest run (`key` null, `jobIds` containing J) ended with a result. There is a question for J. With `paused: true`, or with stage `merged` or `needs-human`, there is none.
4. Test: a lost run (no result event), or a run whose result has `is_error: true`, gives no question.
5. Test: while a run for J is alive (`pid` = `process.pid`), there is no question for J.
6. Test: an older run that ended with a question, followed by a newer finished run for J that moved the job, gives no question. The newest run wins.
7. Test: `launchRun({ repo, text: "use repo X", answer: J })`, with the fake CLI writing its argv to a file, starts a process whose args contain `-p`, `use repo X` (not `/factory use repo X`), `--resume` and the question's session id. The new meta has `key` J and `answers` J.
8. Test: `launchRun({ ..., answer: J })` throws `/not waiting on an answer/` when J has no pending question, and throws `/already has a run/` while a run for J is alive.
9. Test: `finalize()` stores `finalText` from the last of several result events.
10. `cd web && npm run typecheck` and `cd web && npm run build` succeed.
11. `python3 factory/evals/run_evals.py` (Python 3.12+) stays green.
12. Manual browser check:
    - Setup: run `cd web && CLAUDE_BIN=<fake script> FORGELINE_REPOS=<fixture repo> npm run dev`. The fixture repo has the factory installed and a job at `intent`. The fake script prints one `{"type":"result","session_id":"s1","result":"Which repo or package should this be built in?", ...}` line and exits.
    - Clicking "Accept intent" in the drawer gives, within 5 s, a card at Intent with the "needs your answer" badge and that text. The Board tab count includes it.
    - Typing an answer in the card's box and pressing "Send answer" shows the answer in the right-hand chat, and the badge disappears while the run is alive.
    - The run's `web/.data/runs/<id>.meta.json` has `"answers"` set to the job id, and its args include `--resume s1` (visible in the fake script's argv log).
13. `grep -n "needs your answer" web/README.md USAGE.md` finds a line in each.

## Out of scope

- Editing `.claude/**` (the orchestrator skill, agent prompts, `settings.json`) or `factory/scripts/**` (`jobctl.py`, `activity.py`). Both are frozen paths in `factory/policy.json`.
- Questions from sessions not started by the web app (terminal, desktop app, VS Code). They have no web run to resume from here.
- A run that ends before any job exists (no card to put a badge on). The chat still shows it.
- Notifications outside the page (sound, browser notification). The intent says badge only.
- A dismiss or "ignore" control. The intent says a question cannot be dismissed.
- Changing how plain chat messages work (they still start a new job), or turning chat messages into answers automatically.
- Changing the Runs, Activity or Metrics views, or the `dashboard.html` board.
- New dependencies or edits to `web/package.json`.

## Assumptions

- "Job card" means the board card. The same box also goes in the job drawer and the Agents panel, because those are the other job views (the intent's guess). The reply box sits beside the card's open button, not inside it, because a form inside a `<button>` is invalid HTML.
- "Which stops count" was answered "all stops that need a human reply". With no prompt change possible, the spec reads that as: a run that ended where the board offers no next step (mid-loop stages), or a job command that did not move the job. These are the two shapes found in the real runs.
- Ordinary gate messages are not questions. For example, "read intent.md and run /factory accept" ends with the job at a gate whose buttons already exist. They keep the existing "your call" or Accept handling.
- "Several pending questions: all, oldest first." Each stop is one run, and an answer continues that session, so the latest stopped run carries everything still open. Its full final message is shown, with any questions in it in the order asked. Older stopped runs on the same job are superseded by the newer run and are not listed. A human should confirm this reading.
- The answer resumes the stopped session (`--resume`) rather than starting a new `/factory` command, so it works at every stage and keeps the agent's context. An answer that the orchestrator again stops on becomes the next question, by rule (b).
- Failed runs (`is_error`) and lost runs are not shown as questions. The Runs and Activity views already flag them as failed, lost or crashed.
- Runs recorded before this change are judged by rule (a) only, because they have no start snapshot. The manual check therefore uses a fresh run.
- The "within 5 s" target is met by the existing 2 s poll of `/api/jobs`. No new polling or push channel is added.
