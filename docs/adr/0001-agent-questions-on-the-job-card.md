# ADR 0001: Agent questions on the job card

> Note (2026-10-22): the `web/` app this ADR describes was removed when the Studio layout (`web-studio/`) became the only web app. The decision is kept as history; see CONTEXT.md.


- Status: Accepted
- Date: 2026-10-12
- Job: 003-agent-questions-badge (full record: factory/audit/003-agent-questions-badge/)
- Ticket: none

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
