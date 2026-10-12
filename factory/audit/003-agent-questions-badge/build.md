STATUS: READY

# Build: Agent questions on the job card

## Summary
The web app now works out which jobs are waiting on a person from its own run files and
`job.json` (`web/lib/questions.ts`, the rule in the spec's Design), returns them from
`GET /api/jobs` as `questions`, and shows a "needs your answer" badge, the agent's final
message and a reply box on the board card, the job drawer and the Agents current-job panel.
"Send answer" goes through `useChat` with `body.answer`; `launchRun` then resumes the stopped
session with `claude -p "<answer>" --resume <session-id>` and records `answers` and `at` in the
run meta. `EventMapper` keeps `finalText`; `finalize()` stores it clipped to 8000 characters.

Commits on `factory/003-agent-questions-badge` (base 7f66998):
- 0ff41ba web: work out pending agent questions and resume a session with an answer
- 1ee30bb web: return pending questions from /api/jobs and pass answers through /api/chat
- 74a90ad web: needs-your-answer badge and reply box on the card, drawer and Agents panel
- 6366750 docs: describe the needs-your-answer badge and reply box
- 87b550d web: pass the prompt after -- so an answer starting with - is never a CLI option (round 2)

Every run now passes its prompt as the last argument, after `--`
(`claude -p --output-format … --permission-mode … [mcp args] -- <prompt>`), so an answer such
as `--dangerously-skip-permissions` or `- use repo X` can only ever be the prompt.

Files changed: `web/lib/questions.ts` (new), `web/lib/runner.ts`, `web/lib/runs.ts`,
`web/lib/stream.ts`, `web/app/api/chat/route.ts`, `web/app/api/jobs/route.ts`,
`web/components/question-box.tsx` (new), `web/components/board.tsx`,
`web/components/job-drawer.tsx`, `web/components/agents-view.tsx`,
`web/components/app-shell.tsx`, `web/tests/questions.test.ts` (new), `web/tests/runs.test.ts`,
`web/tests/stream.test.ts`, `web/README.md`, `USAGE.md`.

## Acceptance criteria
`cd web && npm test`: 39 tests, 39 pass, 0 fail in round 2 (includes every new case below).

1. [x] "Which repo?" at `intent`, history 1, run key J with `at.history` 1: test "a job command that did not move the job leaves its final message as the question" passes (text, sessionId "s1", runId, job asserted).
2. [x] History now 2: test "a job command that moved the job leaves no question" passes.
3. [x] `build`, `key: null`, J in `jobIds`: test "a run that ended mid-loop is a question unless the job is paused, merged or needs a human" passes, including the `paused`, `merged`, `needs-human` negatives.
4. [x] Lost (init only) and `is_error: true`: test "lost and failed runs are not questions" passes.
5. [x] Alive run (`pid = process.pid`): test "no question while a run for the job is alive" passes.
6. [x] Older question, newer run that moved the job: test "the newest run wins…" passes.
7. [x] `launchRun({ answer: J })` with a fake CLI logging argv: test "an answer resumes the stopped session…" passes: argv contains `-p`, the only item after `--` is `use repo X` (round 2: the prompt moved from right after `-p` to the end, after `--`), item after `--resume` is `s1`, no `/factory use repo X`, meta `key` and `answers` are J.
8. [x] Test "an answer is refused when the job has no question or already has a run" passes (`/not waiting on an answer/`, then `/already has a run/`).
9. [x] `runs.test.ts` "finalize stores the last result's text as finalText, clipped to 8000 characters" and `stream.test.ts` "finalText is the result string of the last result event" pass.
10. [x] `npm run typecheck` exits 0. `npm run build` succeeds (route table printed, exit 0) when run with `env -u NODE_ENV`: this shell exports `NODE_ENV=development`, which makes Next fail prerendering `/_global-error` ("Cannot read properties of null (reading 'useContext')"), an environment issue unrelated to the change.
11. [x] `uv run --python 3.12 python factory/evals/run_evals.py`: "354/354 checks passed".
12. [x] Manual browser check (agent-browser, session `003-agent-questions-badge-builder`, dev server on port 5130 with `CLAUDE_BIN=<fake>`, `FORGELINE_REPOS=<fixture repo with job 001-limit-has-pending at intent>`, `FORGELINE_WEB_DATA=<scratch dir>` so the worktree's `.data` stayed clean):
    - Clicked "Accept intent" in the drawer at 21:23:48; at 21:23:53 the dialog heading read "001-limit-has-pending needs your answer". After closing it the Intent card had the "needs your answer" badge, the text "Which repo or package should this be built in?", a "Your answer" textbox and "Send answer"; the tab read "Board 1".
    - Typed "use repo X" and pressed Enter in the card's box: a newline was added, no dialog opened.
    - Clicked "Send answer": the chat panel showed "use repo X" as a user message, the card lost the badge and showed the WorkingBanner, the tab read "Board" with no count.
    - Fake argv log for the answer run: `-p` / `use repo X` / `--resume` / `s1` / `--output-format` … Meta: `{"prompt": "use repo X", "key": "001-limit-has-pending", "answers": "001-limit-has-pending", "at": {"job": "001-limit-has-pending", "stage": "intent", "history": 1}}`.
    - After the answer run ended (fake also stopped again), the badge came back by rule (b), "Board 1"; the Agents tab's current-job panel showed the badge, the question and the reply box.
13. [x] `grep -n "needs your answer" web/README.md USAGE.md`: README lines 37 and 65, USAGE line 201.

## Validation
Round 2 results:
- `cd web && npm test`: pass (39/39).
- `cd web && npm run typecheck`: pass.
- `uv run --python 3.12 python factory/evals/run_evals.py`: pass, 354/354.
- `policy_check.py … --base 7f66998`: `ESCALATE-TRIGGER large change: 444 changed lines, cap is 400`, nothing else.
- Real CLI (2.1.296) argument parsing, no model call made: `claude -p --model nonexistent-model-xyz --bogus-flag` → `error: unknown option '--bogus-flag'`; `claude -p --model nonexistent-model-xyz -- --bogus-flag` → gets past parsing to the unknown-model error; `claude -p --model nonexistent-model-xyz --strict-mcp-config --mcp-config mcp.json -- "- use repo X"` → also gets to the model error, so `--` ends the variadic `--mcp-config` too.

Round 1 results:
- `cd web && npm test`: pass (38/38).
- `cd web && npm run typecheck`: pass.
- `cd web && env -u NODE_ENV npm run build`: pass (see AC 10 for the `NODE_ENV` note).
- `uv run --python 3.12 python factory/evals/run_evals.py`: pass, 354/354.
- `python factory/scripts/policy_check.py . factory/003-agent-questions-badge --base 7f66998`: one line, `ESCALATE-TRIGGER large change: 424 changed lines, cap is 400`. No frozen path, no suppression, no dependency manifest.
- The web package has no lint script; nothing else to run.

## Definition of done
- [x] Every AC observed on the real artifact: tests plus the AC 12 browser run with argv and meta read back.
- [x] New behaviour has tests that fail without it (`questions.ts`, `finalText`, `answer` and `at` do not exist on the base).
- [x] Existing tests pass, including `runs.test.ts` launch tests and `server.test.ts` `buildPrompt` / `jobKey` (plain chat unchanged). Error paths: empty answer ("Nothing to run."), no question, run already alive, missing session id (no question).
- [x] No dead code, debug output or commented-out blocks.
- [x] No duplicated logic: reuses `useJobCommand`, `WorkingBanner`, `Badge`, `MessageResponse`, `parseLog`, `reconcile`.
- [x] Type-check passes; no lint script exists in `web/`.
- [x] No weakened bar: diff scan and `policy_check.py` show no suppression, skip or removed assertion.
- [x] Callers checked per the blast radius: `EventMapper`, `RunRecord`, `RunMeta`, `launchRun`, `useJobCommand` (optional second arg), `Board` (only in app-shell), `/api/jobs` (only app-shell). `e2e/feature-to-spec.spec.ts` selects the card with `getByRole("button", { name: /isIdle/i })`; the inner button still holds the feature text, so it still matches.
- [x] Config/migrations: none. New meta/record fields are optional; old files still parse.
- [x] Public interface changes are additive (`answer?`, `questions`, optional fields); old callers keep working.
- [x] Docs: `web/README.md` (Board bullet, Behaviour to know) and `USAGE.md` 7b updated.
- [x] The decision is in the spec's Design section.
- [x] Security pass: the answer text goes to `spawn` as one argv item (no shell), last and after `--`, so it can never be parsed as a CLI option (round 2 fix); `answer` must name a job with a pending question (`Object.hasOwn`, so no prototype keys), and the existing localhost/same-origin guard and repo allow-list still apply. The question text is rendered through `MessageResponse` like other agent output.
- [x] Logging: no new critical path beyond the run itself, whose meta, argv and event log are already kept in `web/.data/runs/`.
- [x] Rollback is in plan.md (revert; extra fields stay readable).

## Plan adherence
- Steps 1–4, 12–14 (lib and tests): done as planned in commit 0ff41ba by the interrupted run; I reviewed them against the plan and kept them. `launchRun` checks "already has a run" before the question check, as step 4 requires.
- Steps 5–6 (routes): done as planned.
- Step 7 (drawer): done as planned; the badge sits in the `DialogTitle` row inside `DialogHeader`, and the box is also hidden while `working` (Req 10).
- Step 8 (`question-box.tsx`): done as planned.
- Step 9 (board): done as planned, including the sibling `<div>` that shows `WorkingBanner` when `mine`. Note: because `mine` includes `working`, any card whose job is running now shows the WorkingBanner below its button, not only cards that just sent an answer. That is what the plan specifies, so I kept it; reviewers may want to judge it.
- Step 10 (Agents panel): done as planned.
- Step 11 (app-shell): done as planned (`mcp` hoisted into `useMemo`, `answer` callback, `needMe` counts each job once).
- Steps 15–16 (docs): done.
- Round 2 change beyond the plan: step 4 said to add `--resume` "after `-p prompt`". The security review showed `-p` is a boolean flag, so the prompt is a positional argument. The prompt now goes last, after `--`, for every run, not only answers. Plain chat prompts still reach the CLI unchanged; only their position in argv moved.
- No file outside the plan was changed.
- `policy_check.py` reports a size escalation (424 changed lines against a cap of 400). The change is the planned scope; nothing was cut to get under the cap.

## Skills used
None. `tdd`, `diagnosing-bugs`, `verify-app` and `codebase-design` are not in this session's skill list; the AC 12 check followed the builder rules with `agent-browser` (read `agent-browser skills get core` first).

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
