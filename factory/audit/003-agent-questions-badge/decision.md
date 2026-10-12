ESCALATE

## Why
`policy_check.py` printed `ESCALATE-TRIGGER large change: 444 changed lines, cap is 400`, so this job cannot be auto-approved. Apart from that trigger it looks mergeable. All four round-2 reviews pass, the merge is clean, and I re-ran `npm test` (39/39). The change also adds a new way to start `claude` processes from user text: the answer is passed with `--resume <session>` under `--permission-mode auto`. A person should look at that before it merges.

## Acceptance criteria
1. "Which repo?" at intent, history unchanged, gives a question: met. Test in `web/tests/questions.test.ts`, which passed when I re-ran `npm test`.
2. History moved, so no question: met (test passes).
3. Mid-loop stage gives a question. Paused, merged or needs-human gives none: met (test passes). `questions.ts` has `DONE` and `MID_LOOP` sets that match the spec.
4. Lost or failed runs give no question: met (test passes). The code checks `rec.lost || !rec.ok`.
5. No question while a run is alive: met (test passes).
6. The newest run wins: met (test passes). `mine[0]` is the newest because `listMeta` returns newest first.
7. An answer resumes the session with the prompt verbatim: met. The test asserts `--resume s1` and that `use repo X` is the only item after `--`. I read `runner.ts`: the prompt is the last argv item, after `--`, and `spawn` runs without a shell.
8. Refusals with no question or an already-running job: met. The test passes, and the code checks `Object.hasOwn`.
9. `finalText` comes from the last result event: met (tests in `runs.test.ts` and `stream.test.ts`).
10. Typecheck and build: met per build.md. Build passes only with `env -u NODE_ENV`. I did not re-run it.
11. Python evals 354/354: met per build.md. I did not re-run them.
12. Manual browser check: met per build.md, which gives timestamps, argv and meta. I did not repeat it. The UX reviewer notes the send path was checked only in the builder's browser run.
13. The grep finds "needs your answer" in `web/README.md` and `USAGE.md`: met per build.md, and both files are in the diff.

## Plan adherence
The diff matches plan.md. There is one documented deviation: the prompt moved to the end of argv, after `--`, for every run, not only answers. That was the round-1 security fix, and build.md explains it. Plain chat prompts keep their text and only change position. No file outside the plan changed. The audit trail in `factory/audit/003-agent-questions-badge/` has the spec, plan, build, intent, job.json and both review rounds.

## Policy check
```
ESCALATE-TRIGGER large change: 444 changed lines, cap is 400
```
No VIOLATION and no weakened-bar lines.

## Merge danger
- Door: two-way. The new meta and record fields are optional and additive, and there is no migration. A revert undoes the change, and the extra fields in `web/.data` stay readable.
- Blast radius: module. Everything is in `web/`: the run launcher (argv order for every run), `/api/jobs` and `/api/chat`, and the board, drawer and Agents components.
- Evidence: I ran `npm test` in the worktree: 39 pass, 0 fail. `git merge-tree --write-tree main factory/003-agent-questions-badge` gave a clean tree (424b7ac), with no conflicts. Before writing this I tried to disprove the change by looking for option injection through the answer text. In `runner.ts`, `"--", prompt` is the last argument and `spawn` has no shell, so an answer like `--dangerously-skip-permissions` is only ever the prompt. A test covers that case.

## For the human
Decide whether to merge despite the size trigger. The change is 444 lines against a cap of 400, and build.md says nothing was cut to get under it. Please look at these:
- `web/lib/runner.ts` (launchRun): all runs now pass the prompt after `--`, and answer runs add `--resume <sessionId>`. Confirm you are fine with an answer from the web UI resuming a stopped orchestrator session under `--permission-mode auto`.
- `web/lib/questions.ts`: the rule that decides when a job "needs your answer". The spec's Assumptions ask a human to confirm one reading: when several questions are pending, only the latest stopped run's full message is shown, instead of "all, oldest first".
- `web/components/board.tsx`: the card was restructured so the open button and the question box are siblings. Any card whose job is running now shows WorkingBanner (noted in build.md under Plan adherence, Step 9).
- `intent.md` still starts with `INTENT: DRAFT`, which is what intent-writer always writes. Acceptance shows only in `job.json` history (intent, then spec at 15:19:28Z). Confirm you accepted the intent.
- Optional before merging: run `cd web && env -u NODE_ENV npm run build` and `python3 factory/evals/run_evals.py`. I did not re-run either.
