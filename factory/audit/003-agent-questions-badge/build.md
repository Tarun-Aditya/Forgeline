STATUS: READY

# Build: Agent questions on the job card

## Summary
The web app works out which jobs are waiting on a person from its own run files and
`job.json` (`web/lib/questions.ts`, the rule in the spec's Design), returns them from
`GET /api/jobs` as `questions`, and shows a "needs your answer" badge, the agent's final
message and a reply box on the board card, the job drawer and the Agents current-job panel.
"Send answer" starts a run with `answer: <job id>`; `launchRun` resumes the stopped session with
`claude -p --resume <session-id> … -- <answer>` and records `answers` and `at` in the run meta.
`EventMapper` keeps `finalText`; `finalize()` stores it clipped to 8000 characters. Every run
passes its prompt last, after `--`, so an answer starting with `-` is never read as an option.

Round 3 (rework-1): main (be04765, eb2b807) is merged into the branch. Main replaced the
`useChat` chat panel with independent runs: the client now starts runs with `POST /api/runs`
and follows one in the right-hand Runs panel, and the drawer and Agents panel show the latest
run's closing message ("Latest from the orchestrator"). So in the merge:
- `POST /api/runs` also passes `answer` through (same check as `/api/chat`, which keeps it).
- `app-shell.tsx`: `submit` and the new `answer` share one `start()` that posts to `/api/runs`
  and selects the new run in the Runs panel; `questions` feed the Board, Agents, drawer and
  the Board tab count as before.
- Drawer and Agents panel: while a question is shown, "Latest from the orchestrator" is
  hidden, because the question box shows the same text.
- `web/README.md`: the answer "opens in the Runs panel" instead of "shows in the chat".

Commits on `factory/003-agent-questions-badge`:
- 0ff41ba web: work out pending agent questions and resume a session with an answer
- 1ee30bb web: return pending questions from /api/jobs and pass answers through /api/chat
- 74a90ad web: needs-your-answer badge and reply box on the card, drawer and Agents panel
- 6366750 docs: describe the needs-your-answer badge and reply box
- 87b550d web: pass the prompt after -- so an answer starting with - is never a CLI option (round 2)
- 71b336e Merge main into factory/003-agent-questions-badge: answers go through POST /api/runs (round 3)
- cffc280 docs: an answer run opens in the Runs panel, not the chat (round 3)

Files changed against main: `web/lib/questions.ts` (new), `web/lib/runner.ts`, `web/lib/runs.ts`,
`web/lib/stream.ts`, `web/app/api/chat/route.ts`, `web/app/api/jobs/route.ts`,
`web/app/api/runs/route.ts` (round 3), `web/components/question-box.tsx` (new),
`web/components/board.tsx`, `web/components/job-drawer.tsx`, `web/components/agents-view.tsx`,
`web/components/app-shell.tsx`, `web/tests/questions.test.ts` (new), `web/tests/runs.test.ts`,
`web/tests/stream.test.ts`, `web/README.md`, `USAGE.md`.

## Acceptance criteria
`cd web && npm test` after the merge: 40 tests, 40 pass, 0 fail (39 from this branch plus main's new agents test).

1. [x] "Which repo?" at `intent`, history 1, run key J with `at.history` 1: test "a job command that did not move the job leaves its final message as the question" passes.
2. [x] History now 2: test "a job command that moved the job leaves no question" passes.
3. [x] `build`, `key: null`, J in `jobIds`: test "a run that ended mid-loop is a question unless the job is paused, merged or needs a human" passes, including the negatives.
4. [x] Lost and `is_error: true`: test "lost and failed runs are not questions" passes.
5. [x] Alive run: test "no question while a run for the job is alive" passes.
6. [x] Newest run wins: test "the newest run wins…" passes.
7. [x] `launchRun({ answer: J })`: test "an answer resumes the stopped session…" passes (`--resume s1`, `use repo X` the only item after `--`, meta `key` and `answers` are J). Also seen in the round 3 browser run (AC 12).
8. [x] Test "an answer is refused when the job has no question or already has a run" passes.
9. [x] `finalText` tests in `runs.test.ts` and `stream.test.ts` pass.
10. [x] `npm run typecheck` exits 0 after the merge. `env -u NODE_ENV npm run build` succeeds (route table printed). The `NODE_ENV=development` note from round 1 still applies to this shell.
11. [x] `uv run --python 3.12 python factory/evals/run_evals.py`: "354/354 checks passed".
12. [x] Round 3 browser check on the merged code (agent-browser session `003-agent-questions-badge-builder`, `next dev` on port 5130, `CLAUDE_BIN` = a fake that logs argv, waits 4s and ends with result "Which repo or package should this be built in?" and session `s1`; `FORGELINE_REPOS` = a scratch fixture repo with job `001-limit-has-pending` at `intent`; `FORGELINE_WEB_DATA` = scratch dir):
    - Clicked "Accept intent" in the drawer at 21:45:27. The WorkingBanner showed. About 12s later the dialog heading read "001-limit-has-pending needs your answer", with the question text, a "Your answer" textbox and "Send answer". "Latest from the orchestrator" was not shown, so the text was not repeated.
    - Closed the dialog. The Intent card showed the "needs your answer" badge, the question and the reply box. The tab read "Board 1".
    - Typed "use repo X" in the card's box and pressed Enter. The textarea value became `"use repo X\n"` and no dialog opened.
    - Clicked "Send answer". The card showed the WorkingBanner and lost the badge, and the tab read "Board". The Runs panel listed a new run "running use repo X 001", selected it and showed "use repo X" as its title.
    - Fake argv for the answer run: `-p --resume s1 --output-format stream-json --verbose --permission-mode auto -- use repo X`. Meta: `"prompt":"use repo X","key":"001-limit-has-pending","answers":"001-limit-has-pending","at":{"job":"001-limit-has-pending","stage":"intent","history":1}`.
    - When the answer run ended, the badge came back (the fake asked again) and the tab read "Board 1". The Agents tab's current-job panel showed the badge, the question and the reply box, with no "Latest from the orchestrator" box.
    - I set the fixture job to `build` with `paused: true`, so there was no question. The Agents panel then showed "Latest from the orchestrator" with the message and the Resume button, so main's behaviour is unchanged when no question is pending.
    - (The Agents view also showed "activity.py: No such file", because the fixture repo has no `factory/scripts/`. This comes from the fixture and has nothing to do with this change.)
13. [x] `grep -n "needs your answer" web/README.md USAGE.md`: README lines 37 and 65, USAGE line 201.

## Validation
Round 3 results (after the merge of main):
- `cd web && npm test`: pass (40/40).
- `cd web && npm run typecheck`: pass.
- `cd web && env -u NODE_ENV npm run build`: pass.
- `uv run --python 3.12 python factory/evals/run_evals.py`: pass, 354/354.
- `python3 factory/scripts/policy_check.py . factory/003-agent-questions-badge --base main`: `ESCALATE-TRIGGER large change: 464 changed lines, cap is 400`, nothing else (no frozen path, suppression or manifest).
- No route tests exist in `web/tests/`, so the `/api/runs` `answer` pass-through is covered by the browser run in AC 12, as `/api/chat` was in round 1.
- `git status --porcelain` in the worktree prints nothing.

Round 2 results:
- `cd web && npm test`: pass (39/39). `npm run typecheck`: pass. Evals 354/354.
- `policy_check.py … --base 7f66998`: `ESCALATE-TRIGGER large change: 444 changed lines, cap is 400`, nothing else.
- Real CLI (2.1.296) argument parsing: `--` makes the next item the prompt, also after the variadic `--mcp-config`.

Round 1 results:
- `npm test` 38/38, typecheck, build, evals 354/354; policy_check: size escalation only (424 lines).

## Definition of done
- [x] Every AC observed on the real artifact: tests plus the AC 12 browser run on the merged code, with argv and meta read back.
- [x] New behaviour has tests that fail without it (`questions.ts`, `finalText`, `answer` and `at` do not exist on main).
- [x] Existing tests pass, including main's new `agents.test.ts` case, the `runs.test.ts` launch tests and `server.test.ts`. Error paths: empty answer, no question, run already alive, missing session id.
- [x] No dead code, debug output or commented-out blocks.
- [x] No duplicated logic: `submit` and `answer` share one `start()` in app-shell. The drawer and Agents panel hide `LastMessage` while the question box shows the same text.
- [x] Type-check passes; no lint script exists in `web/`.
- [x] No weakened bar: `policy_check.py` shows no suppression, skip or removed assertion. The one `eslint-disable-line` in `agents-view.tsx` comes from main and is not in this branch's diff.
- [x] Callers checked: `Board`, `AgentsView` and `JobDrawer` are rendered only in `app-shell.tsx`. `launchRun` is called by `/api/runs` (new `answer` pass-through), `startRun` → `/api/chat`, and the tests.
- [x] Config/migrations: none. The new meta and record fields are optional.
- [x] Public interface changes are additive (`answer?` on both run routes, `questions`, optional props).
- [x] Docs: `web/README.md` (updated for the Runs panel) and `USAGE.md` 7b.
- [x] The decision is in the spec's Design section.
- [x] Security pass: the answer is one argv item, last and after `--`, with no shell. `answer` must name a job with a pending question (`Object.hasOwn`). The same localhost and same-origin guard and repo allow-list cover `/api/runs`. The question is rendered through `MessageResponse`.
- [x] Logging: run meta, argv and event log are kept in `web/.data/runs/` as before.
- [x] Rollback: revert the branch; the extra fields stay readable.

## Plan adherence
- Steps 1–16: done in rounds 1–2 as recorded in the Log.
- Round 3 rework ("rebase onto current main, resolve any conflicts"):
  - I merged main into the branch (merge commit 71b336e) instead of rebasing. A rebase would rewrite the orchestrator's audit commits that are already on the branch. The result is the same: main is an ancestor of the branch, so it merges cleanly.
  - The "Rebase onto main" button's own tooltip also says "merge main into its branch".
- Deviation from spec/plan caused by main: the spec's Design (and plan step 11) sends the answer through `useChat` so it "appears in the chat panel as a user message". Main removed `useChat` from the app shell. Runs are now started with `POST /api/runs` and followed in the right-hand Runs panel.
  - The answer now goes the same way: it starts a run that the Runs panel lists and selects, with the answer text as its title, and streams there.
  - The panel's log view (main's `RunViewer`) replays only the run's output, not the prompt as a chat bubble. That is how main shows every run, so the answer appears as the run's title rather than as a user bubble.
  - Reviewers should judge whether this still meets the spec's Req for AC 12 ("the answer appears in the chat panel").
- File not named in plan.md: `web/app/api/runs/route.ts` now passes `answer` through. It is needed because main's client posts to this route, not to `/api/chat`. `/api/chat` keeps its `answer` pass-through (spec Req 5).
- Interaction with main's "Latest from the orchestrator": I hide it while a question box shows on the same job, so the same text does not appear twice. Main's Resume button for a stuck mid-loop job still shows next to the question box. Resume and an answer are both valid ways to continue, so I left both.
- `policy_check.py` still reports a size escalation (464 changed lines against main, cap 400). The extra lines over round 2 come from resolving the merge against main's new code. Nothing was cut to get under the cap.

## Skills used
None. `tdd`, `diagnosing-bugs`, `verify-app` and `codebase-design` are not in this session's skill list. The AC 12 check followed the builder rules with `agent-browser` (I read `agent-browser skills get core` first).

## Log
### Round 1
- A previous run was interrupted after commit 0ff41ba (lib, tests). It left uncommitted route, component and new `question-box.tsx` changes. I reviewed them against plan steps 5–11, found them correct, and committed them in two commits.
- Wrote the README and USAGE docs (steps 15–16) and committed.
- Ran tests, typecheck, build, evals and policy_check; did the AC 12 browser check with a fake CLI and fixture repo in the scratchpad, then closed the browser and stopped the dev server. Worktree is clean.

### Round 2
Reviews: code, ui and ux PASS; security CHANGES.
- Security finding 1 (an answer starting with `-` is parsed as a CLI option, for example `--dangerously-skip-permissions`): fixed with the review's Option A. In `web/lib/runner.ts` the args are now `-p`, the flags and MCP args, then `"--", prompt`. First I confirmed on the real CLI that `--` makes the next item the prompt, also after the variadic `--mcp-config` (see Validation).
- Tests for that fix:
  - I added "an answer that looks like an option reaches the CLI only as the prompt, after --". It uses `--dangerously-skip-permissions` and asserts it is the only item after `--`.
  - I tightened the AC 7 test to assert `use repo X` is the only item after `--` (it used to check the item right after `-p`).
  - Both failed before the fix (7 pass, 2 fail) and pass after it (full suite 39/39). Commit 87b550d.
- Security notes (answer as lookup key, no shell, rendering, 8000-character payload): no change needed.
- Notes in the PASS reviews are optional; I left them unchanged.
- Worktree is clean after the commit.

### Round 3
Rework-1: "rebase onto current main, resolve any conflicts, and run the review again".
- Merged main (be04765, eb2b807) into the branch. There were conflicts in `app-shell.tsx`, `board.tsx`, `agents-view.tsx` and `job-drawer.tsx`; `runner.ts` and `runs.ts` merged on their own.
- Resolved them by taking main's version and adding back this branch's changes:
  - `questions` props.
  - The `answer` callback, now posting to `/api/runs` through a `start()` it shares with `submit`.
  - The badge, the reply box and the Board tab count.
  - `LastMessage` hidden while a question shows.
  - Added `answer` to `POST /api/runs`.
- Updated the README line that said the answer shows in the chat.
- Ran tests (40/40), typecheck, build, evals (354/354) and policy_check. Did the AC 12 browser check again on the merged code with a fake CLI. Closed the browser and stopped the dev server. The worktree is clean.
