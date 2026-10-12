PLAN: READY

# Plan: Agent questions on the job card

## Approach
Follow the spec's Design exactly. A new server module, `web/lib/questions.ts`, works out each job's pending question from the web app's own run files (`listMeta()`, `loadRuns()`) and the `job.json` data passed in. `GET /api/jobs` returns the result as `questions`. `EventMapper` keeps the last `result` string (`finalText`), and `finalize()` stores it clipped to 8000 characters. `launchRun()` writes a start snapshot (`RunMeta.at`) for the job a run acts on. It also gains an `answer` mode that resumes the stopped session with `claude -p "<text>" --resume <sessionId>`. On the client, a shared `QuestionBadge` / `QuestionBox` (new `web/components/question-box.tsx`) appears on the board card, the job drawer and the Agents current-job panel. Answers go through `useChat` (`sendMessage` with `body.answer`), so they show in the chat panel. To keep one lock rather than add a second, `useJobCommand().send` gets an optional second argument: the function that sends the text. The spec's Design section rules out the alternatives (prompt-declared questions, which need frozen paths; text heuristics; new `/factory` verbs), so this plan does not revisit them.

Library facts checked:
- The installed `claude` CLI help lists `-r, --resume [value]` and says it continues a session in `--print` mode.
- `claude -p` resumes by session id inside the same project directory. `launchRun` already spawns with `cwd: input.repo`, the same directory the stopped run used.
- The textarea is `web/components/ui/textarea.tsx`.
- `MessageResponse` is exported from `web/components/ai-elements/message.tsx:326`.
- The tests run with `node --experimental-strip-types` on Node v24.5.0. New lib code must use `.ts` import extensions and `import type`, and no enums or parameter properties.
- No Next.js API beyond existing route patterns is used. `web/AGENTS.md` asks to read `node_modules/next/dist/docs/` before writing Next code. The routes only change their JSON, so no new Next API is involved.

## Steps
1. `web/lib/stream.ts`:
   - Add a public field `finalText: string | undefined` to `EventMapper`.
   - In the `ev.type === "result"` branch, set `this.finalText = typeof ev.result === "string" ? ev.result : undefined`, so the last result event wins.
   - Nothing else changes.
2. `web/lib/runs.ts`:
   - `RunMeta` gains `answers?: string` and `at?: { job: string; stage: string; history: number }`.
   - `RunRecord` gains `finalText?: string`.
   - In `finalize()`, take `finalText` from `parseLog(id)` too and add `finalText: finalText?.slice(0, 8000)` to the record.
3. `web/lib/questions.ts` (new):
   - Exports `type Question = { job: string; runId: string; sessionId: string; text: string; askedAt: string }` and `pendingQuestions(repo: string, jobs: Job[]): Record<string, Question>`.
   - Imports `alive, listMeta, loadRuns, parseLog, reconcile` from `./runs.ts` and `import type { Job } from "./jobs.ts"`.
   - Algorithm:
     - Call `reconcile()` first, so ended runs have a `RunRecord`. This is the same as `activeRuns()`.
     - `metas = listMeta().filter(m => m.repo === repo)`, which is already newest-first by `startedAt`.
     - Build a `live` map with one `alive(pid)` call per meta, and `records = new Map(loadRuns().map(r => [r.runId, r]))`.
     - For each `job`:
       - Skip it if `job.paused` or its stage is in `{merged, split, needs-human}` (rule 4).
       - `runs` = the metas where `m.key === J || m.answers === J || records.get(m.runId)?.jobIds.includes(J) || (live && !m.before.includes(J))` (rule 1).
       - Skip if `runs` is empty, or if any of them is live (rule 3).
       - `m = runs[0]`, `rec = records.get(m.runId)`. Skip unless `rec && !rec.lost && rec.ok` (rule 2; `ok` already means a result exists with `isError` false).
       - Rule 5 holds when either of these is true:
         - (a) `MID_LOOP = {spec, plan, build, review, approve}` contains the stage.
         - (b) `(m.key === J || m.answers === J) && m.at?.job === J && (job.history?.length ?? 0) === m.at.history`.
         Skip if neither holds.
       - Only now read the text: `text = rec.finalText`, `sessionId = rec.sessionId`. If `rec.finalText === undefined` (an old record), call `parseLog(m.runId)` once for that one run and take `finalText` (clipped to 8000) and fill in a missing `sessionId`.
       - Skip if `text?.trim()` is empty or `sessionId` is missing (it cannot be resumed).
       - Set `out[J] = { job: J, runId: m.runId, sessionId, text, askedAt: rec.endedAt }`.
4. `web/lib/runner.ts`:
   - `StartInput` gains `answer?: string`.
   - Change `launchRun` as follows:
     - If `input.answer` is set:
       - `prompt = input.text.trim()`. Throw `Nothing to run.` if it is empty.
       - `key = input.answer`.
       - **First** keep the existing check `Job <key> already has a run in progress.`. It must come before the question check: while a run is alive, rule 3 removes the question, and AC 8 expects `/already has a run/`.
       - Then `const q = pendingQuestions(input.repo, listJobs(input.repo))` and, if `!Object.hasOwn(q, key)`, throw `Job ${key} is not waiting on an answer.` (`hasOwn` so ids such as `constructor` never match a prototype key.)
       - Add `"--resume", q[key].sessionId` to `args` after `-p prompt`.
     - Otherwise keep `buildPrompt` and `jobKey` exactly as they are today.
     - Compute `const jobs = listJobs(input.repo)` once, before spawning, and reuse it for `before`.
     - `target = input.answer ?? key`. If `target` and a job with that id exists, write `at: { job, stage, history: history?.length ?? 0 }`.
     - Write `answers: input.answer` only when it is set.
   - Import `pendingQuestions` from `./questions.ts`. There is no import cycle: `questions.ts` imports only `runs.ts` and a type.
5. `web/app/api/chat/route.ts`: `Body` gains `answer?: string`. Pass `answer: typeof body.answer === "string" ? body.answer : undefined` to `startRun`.
6. `web/app/api/jobs/route.ts`: `const jobs = listJobs(repo)`. Return `{ jobs, stages, active, questions: pendingQuestions(repo, jobs) }`. Keep `activeRuns()` before `pendingQuestions`, as today.
7. `web/components/job-drawer.tsx`:
   - Change `useJobCommand`'s `send` to `(text: string, via?: (text: string) => void)`. It calls `(via ?? onCommand)(text)` and uses the same `sent` lock. All other behaviour stays the same.
   - Add props `question?: Question` and `onAnswer: (jobId: string, text: string) => void`.
   - In `DialogHeader`, show `<QuestionBadge />` when `question && !working`.
   - Below `<Actions>`, render `{question && !working && !mine && <QuestionBox question={question} locked={locked} onSend={(t) => send(t, (x) => onAnswer(job.id, x))} />}`.
   - `{mine && <WorkingBanner />}` already covers the state after sending.
8. `web/components/question-box.tsx` (new, `"use client"`):
   - `QuestionBadge({ className? })`: `<Badge className={cn("bg-call text-white", className)}>needs your answer</Badge>`.
   - `QuestionBox({ question, locked, onSend })`:
     - The question rendered in `<div className="max-h-48 overflow-y-auto rounded-md border p-2 text-sm"><MessageResponse>{question.text}</MessageResponse></div>`.
     - A `Textarea` with local state and `aria-label="Your answer"`.
     - A `Button` "Send answer", `disabled={locked || !text.trim()}`. On click: `onSend(text.trim())`, then clear the text.
     - No dismiss control and no Enter-to-submit handler.
9. `web/components/board.tsx`:
   - `JobCard` gains props `question?: Question`, `busy: boolean`, `onAnswer(jobId, text)`, and calls `useJobCommand(job, busy, running, () => {})`. The default sender is never used, because every `send` passes `via`.
   - Restructure the card. The outer element becomes a `<div>` holding the border, the `border-call/60` highlight (when `human || asking`, where `asking = !!question && !running`) and the merged opacity. Inside it:
     - The existing `<button onClick={onOpen}>` with all the current content. Add the `QuestionBadge` in the header row. Its `ml-auto` applies only when there is no `trouble` badge and no "your call" badge.
     - A sibling `<div className="space-y-2 border-t p-3">`, rendered when `mine || asking`. It shows `<WorkingBanner />` if `mine`, else `<QuestionBox ... onSend={(t) => send(t, (x) => onAnswer(job.id, x))} />`.
   - The reply box is never inside the `<button>`, so Enter in the textarea cannot open the drawer.
   - `Board` gains props `questions: Record<string, Question>`, `busy: boolean`, `onAnswer` and passes them through.
   - `Question` is imported with `import type` from `@/lib/questions`, the same way `Job` is imported today.
10. `web/components/agents-view.tsx`:
    - Props gain `questions` and `onAnswer`.
    - `q = current && questions[current.id]`, `asking = !!q && !running.has(current.id)`.
    - When `asking`: the section border gets `border-call/60` and the badge row gets `<QuestionBadge />`.
    - After `<Actions>`, render `{asking && !mine && <QuestionBox question={q} locked={locked} onSend={(t) => send(t, (x) => onAnswer(current.id, x))} />}`.
11. `web/components/app-shell.tsx`:
    - Type `jobData` with `questions: Record<string, Question>`, and set `const questions = jobData?.questions ?? {}`.
    - Hoist the MCP selection into one value (`useMemo`) used by both `submit` and the new `answer`.
    - `answer = useCallback((jobId, text) => { if (!repo) return; sendMessage({ text }, { body: { repo, answer: jobId, mcp } }) }, ...)`. It never touches `starting`.
    - `needMe = jobs.filter(j => j.stage === "spec-approval" || j.stage === "needs-human" || (questions[j.id] && !running.has(j.id))).length`. Each job is counted once.
    - Pass `questions`, `busy` and `onAnswer={answer}` to `Board`, `questions` and `onAnswer` to `AgentsView`, and `question={open ? questions[open] : undefined}` and `onAnswer` to `JobDrawer`.
12. `web/tests/questions.test.ts` (new):
    - Set its own `FORGELINE_WEB_DATA` temp dir before importing the modules, and use a fresh temp repo per test with `factory/jobs/<id>/job.json`.
    - Helpers:
      - `meta(...)` writes a meta through `writeMeta` with explicit `startedAt`.
      - `log(id, lines)` writes the event log.
      - `deadPid()` comes from `runs.test.ts`.
      - `script()` writes a fake `CLAUDE_BIN`.
    - Cases for AC 1–8 (see Proof).
13. `web/tests/runs.test.ts`:
    - Add the AC 9 case: a log with two result events, `"first"` then `"second"` → `finalize().finalText === "second"`. Also check a 9000-character result is clipped to 8000.
    - Add the Req 3 case: `launchRun({ repo, text: "/factory accept 009-y" })` with job `009-y` at `intent`, history 1 → `readMeta(id).at` deep-equals `{ job: "009-y", stage: "intent", history: 1 }` and `answers` is undefined. Drain or stop the run afterwards.
14. `web/tests/stream.test.ts`: add a unit case that `EventMapper.finalText` is the last result's `result` string.
15. `web/README.md`:
    - In "What it does", extend the **Board** bullet with: a card whose agent stopped shows a "needs your answer" badge, the question and a reply box, and the answer resumes that session (`--resume`).
    - In "Behaviour to know", add a bullet with the rule in one or two sentences: the latest web run on the job ended with a result and left the job mid-loop, or a job command did not move it. Say that only web-started runs are covered, and that an answer run's prompt in Runs is the answer text.
16. `USAGE.md` section 7b: add one sentence with the same content, including the words "needs your answer".

## Proof
1. AC1, "which repo?" at `intent`. New test in `questions.test.ts`:
   - Setup: job at `intent` with 1 history entry. A dead run with `key` J, `at.history` 1 and log `result` "Which repo?", `session_id` "s1".
   - Expect: `pendingQuestions(repo, listJobs(repo))[J]` has `text` "Which repo?", `sessionId` "s1" and that `runId`.
2. AC2. New test: the same setup, then rewrite `job.json` with 2 history entries → no question for J.
3. AC3. New test:
   - Setup: job at `build`. A dead run with `key: null`, `before: []`, and a result. `finalize` puts J into `jobIds` because J was "created".
   - Expect: a question.
   - Then, for each of `paused: true`, stage `merged` and stage `needs-human`, expect no question.
4. AC4. New test: a dead run whose log has only an `init` event (lost), and a separate repo whose run ends with `is_error: true` → no question in either.
5. AC5. New test: the AC1 setup plus a newer meta for J with `pid: process.pid` → no question.
6. AC6. New test:
   - Setup: an older run (explicit earlier `startedAt`) that ended with a question, and a newer finished run with `key` J and `at.history` 1. The job's history is now 2.
   - Expect: no question.
7. AC7. New test in `questions.test.ts`:
   - Setup: the AC1 setup, and a fake `CLAUDE_BIN` that runs `printf '%s\n' "$@" > argv.txt` then prints a result line. Call `launchRun({ repo, text: "use repo X", answer: J })` and drain `followRun`.
   - Expect:
     - The argv lines contain `-p`, `use repo X` (the item right after `-p`), `--resume` and `s1`, and do not contain `/factory use repo X`.
     - `readMeta(id)` has `key` J and `answers` J.
8. AC8. New test:
   - `launchRun({ repo, text: "x", answer: K })` for a job with no question throws `/not waiting on an answer/`.
   - In a repo with an alive meta (`key` J, `pid: process.pid`), it throws `/already has a run/`.
9. AC9: new test in `runs.test.ts`, plus the new `EventMapper.finalText` unit test in `stream.test.ts`.
10. AC10: `cd web && npm run typecheck` and `cd web && npm run build`.
11. AC11: `python3 factory/evals/run_evals.py` (Python 3.12+; `uv run --python 3.12 python factory/evals/run_evals.py`).
12. AC12, the manual browser check, exactly as in the spec:
    - Write a fake script that logs argv to a file and prints one `result` line with `session_id` "s1".
    - Run `CLAUDE_BIN=<script> FORGELINE_REPOS=<fixture> npm run dev`.
    - Click "Accept intent". Within 5 s the card shows the badge and the text, and the Board count includes it.
    - Send an answer. It appears in the chat, and the badge hides while the run is alive.
    - The run's `meta.json` has `"answers"`, and the argv log shows `--resume s1`.
13. AC13: `grep -n "needs your answer" web/README.md USAGE.md` finds a line in each.
14. Req 3 (`at` written for a keyed run): the new test in `runs.test.ts`. Req 4 (plain chat unchanged): the existing `runs.test.ts` launch tests and the `server.test.ts` `buildPrompt` / `jobKey` tests must still pass.

New tests: everything in `web/tests/questions.test.ts`, the two additions to `runs.test.ts`, and one to `stream.test.ts`.

## Blast radius
Found with grep under `web/`:
- `EventMapper`:
  - `lib/runs.ts` `parseLog`.
  - `lib/runner.ts` `followRun`.
  - `tests/stream.test.ts`.
  - It only gains a field. Its chunk output is unchanged.
- `RunRecord` / `loadRuns`:
  - `lib/metrics.ts` `summarize`, which reads only cost and usage fields. The extra `finalText` is ignored.
  - `app/api/runs/route.ts`, which builds its own response object and does not forward the record, so `finalText` does not reach the Runs payload.
  - `runs.jsonl` grows by up to 8 KB per run.
- `RunMeta`, `listMeta`, `statusOf`:
  - `app/api/runs/route.ts`.
  - `activeRuns` / `reconcile` in `runner.ts`.
  - The new fields are optional. Old meta files still parse.
- `launchRun` / `startRun`: `app/api/chat/route.ts` and `tests/runs.test.ts`. The non-answer path is unchanged apart from writing `at`.
- `useJobCommand`: `job-drawer.tsx` and `agents-view.tsx`. Adding an optional second argument to `send` keeps every existing call valid.
- `Board`: used only in `app-shell.tsx`. `ReviewChips` is imported by `agents-view.tsx` and is unchanged.
- `/api/jobs`: polled only in `app-shell.tsx`, which gains a field. `e2e/feature-to-spec.spec.ts` drives the UI and may rely on the card being a `<button>`. I did not read that spec in full. The builder should grep it for selectors on the card (it is not run by `npm test`).

Why it is safe:
- `pendingQuestions` only reads. It writes nothing except through `reconcile()` → `finalize()`, which already runs on every `/api/jobs` poll via `activeRuns()` (`web/lib/runner.ts:45-50`, `web/lib/runs.ts:112-133`) and writes each record once. Status: pointed at `file:line`.
- Plain chat behaviour is unchanged, because the `answer` branch runs only when `input.answer` is set. Status: said so, not yet run. The existing `runs.test.ts` and `server.test.ts` cases run the real code for this, plus the new Req 3 test.
- `claude -p --resume <id>` continues the stopped session's context. Status: the CLI help lists the flag. I have not run it against a real session, so it is listed under Risks. AC12 uses a fake CLI, so only a real run proves it.

## Policy flags
- Frozen paths this plan would need to edit: none. Every change is under `web/` plus `USAGE.md`.
- Escalate paths it touches: none.
- New dependencies: none. `web/package.json` is not edited. The worktree has no `web/node_modules`, so the builder must run `cd web && npm ci`, which installs from the existing lockfile and changes no files.

## Risks and rollback
- **Real `--resume` behaviour is unproven here.** The run must start in the same cwd (it does, `cwd: input.repo`). With `--resume`, Claude may give the run a new session id. That does no harm: the next question takes its id from the new run's record.
- **False positives.** A mid-loop stop that is not really a question, for example a run that ended in `build` after a crash that still produced a result, shows a badge. This follows the spec's rule as written. The reply box then just resumes the session.
- **Missing session id.** A run with no session id gets no question rather than a badge that cannot be answered.
- **Poll cost.** `/api/jobs` now calls `listMeta`, `loadRuns` and possibly one `parseLog` per job on each 2 s poll. That is small for local history, but it grows with `runs.jsonl`.
- **Merge conflicts.** The main checkout has uncommitted edits to `app-shell.tsx`, `board.tsx`, `agents-view.tsx`, `run-panel.tsx`, `runs-view.tsx` and `app/api/runs/route.ts` that are not on this branch. Expect conflicts in `app-shell.tsx`, `board.tsx` and `agents-view.tsx` when they are reconciled.
- **Card markup.** The card is no longer a single `<button>`. Anything selecting the card as a button, such as the e2e spec, may need its selector checked.
- **The "several questions" reading.** The spec's Assumptions say a human should confirm that showing only the latest stopped run's full message is acceptable.
- **Rollback.** Revert the merge commit. Run files with the extra optional fields (`answers`, `at`, `finalText`) stay readable by the old code, so no data cleanup is needed.

## Validation
- `cd web && npm ci` (worktree has no `node_modules`)
- `cd web && npm test`
- `cd web && npm run typecheck`
- `cd web && npm run build`
- `python3 factory/evals/run_evals.py` (Python 3.12+, e.g. `uv run --python 3.12 python factory/evals/run_evals.py`)
- The AC12 manual browser check with a fake `CLAUDE_BIN`.
