ESCALATE

## Why
`policy_check.py` printed `ESCALATE-TRIGGER large change: 464 changed lines, cap is 400`, so I cannot auto-approve this job. Apart from that trigger it looks mergeable. All four round-3 reviews pass, `git merge-tree` is clean, and I re-ran `cd web && npm test` (40/40 pass). The part most likely to be wrong is the answer path, which starts `claude -p --resume <session>` under `--permission-mode auto` with text the user typed. I read `web/lib/runner.ts` and `web/app/api/runs/route.ts` to check it. The answer must name a job that `pendingQuestions` returns (`Object.hasOwn`). The session id comes from server-side run records. The prompt is the last argv item, after `--`, and `spawn` uses no shell. I found no problem there. A human approved this after round 2 (`/factory approve`). Round 3 was the requested merge of main and pushed the line count from 444 to 464, so the trigger still applies.

## Acceptance criteria
1. Question at intent when history is unchanged: met. The test passes in my `npm test` run.
2. Moved history gives no question: met (test passes).
3. Mid-loop stage gives a question. Paused, merged or needs-human gives none: met (test passes). The `DONE` and `MID_LOOP` sets in `questions.ts` match the spec.
4. Lost or failed runs give no question: met (test passes). The code checks `rec.lost || !rec.ok`.
5. No question while a run is alive: met (test passes).
6. The newest run wins: met (test passes). `mine[0]` is the newest because `listMeta` returns newest first.
7. An answer resumes the session: met. The test passes, and I read `runner.ts`: `--resume` comes before the other flags and the prompt comes after `--`.
8. Refusals (no question, or a run already alive): met (test passes).
9. `finalText` comes from the last result event: met (tests pass).
10. Typecheck and build: met per build.md and the round-3 code review (typecheck re-run there). I did not re-run them.
11. Python evals 354/354: met per build.md. I did not re-run them. The merge touched only `web/` and docs.
12. Manual browser check: met per build.md (round-3 run on the merged code, with argv and meta read back). The UX reviewer saw the badge and reply box but did not send an answer. The spec says the answer "appears in the chat panel". After main's change it opens as a run in the Runs panel instead. build.md documents this deviation and the reviewers accepted it.
13. `grep "needs your answer"` finds a line in README and USAGE: met per build.md (README lines 37 and 65, USAGE line 201).

## Plan adherence
The diff matches plan steps 1-16. There are two deviations, both explained in build.md and both caused by main replacing `useChat` with `POST /api/runs`. First, `web/app/api/runs/route.ts` is not in the plan but now also passes `answer` through. Second, the answer appears in the Runs panel, not as a chat bubble. The rework asked for a rebase, and the builder merged main instead so the audit commits are not rewritten. The result is the same.

## Policy check
ESCALATE-TRIGGER large change: 464 changed lines, cap is 400

There is no VIOLATION line and no weakened-bar line.

## Merge danger
- Door: two-way. The new meta and record fields are optional, and a revert removes the feature cleanly.
- Blast radius: local. Only the web app (`web/`) and one USAGE.md section change. It adds a new way to start `claude` runs, behind the existing localhost and same-origin guard.
- Evidence: `npm test` 40/40 pass in the worktree. `git merge-tree --write-tree main factory/003-agent-questions-badge` returned a tree with no conflicts. The worktree is clean.

## For the human
- Decide whether to accept a 464-line change over the 400-line cap. You approved the 444-line version after round 2. The extra 20 lines come from resolving the merge with main (`web/components/app-shell.tsx`, `board.tsx`, `job-drawer.tsx`, `agents-view.tsx`, `web/app/api/runs/route.ts`).
- Confirm you accept that an answer opens as a run in the Runs panel, not as a chat bubble (spec AC 12 wording). See the "Plan adherence" section of build.md.
- Optional: send a real answer once in the browser. Reviewers checked the send path only in the builder's fake-CLI run. Files: `web/lib/runner.ts`, `web/lib/questions.ts`, `web/components/question-box.tsx`.
