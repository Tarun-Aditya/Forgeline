VERDICT: PASS

## Checks
- `cd web && npm test`: pass (38 tests, 38 pass, 0 fail)
- `cd web && npm run typecheck`: pass
- `policy_check.py . factory/003-agent-questions-badge`: only `ESCALATE-TRIGGER large change: 424 changed lines, cap is 400`. No weakened-bar lines, no frozen paths, no suppressions. build.md already records the size trigger.
- Not re-run by me: `npm run build` and the Python evals (build.md reports both pass). No web lint script exists.

## Findings
None.

## Notes
- Spec and plan fit: `questions.ts` implements the Design rule as written (newest run wins, a live run blocks, paused/merged/split/needs-human excluded, rule (a) mid-loop, rule (b) unmoved history). Old records fall back to `parseLog` for the one selected run only. `launchRun` checks "already has a run" before "not waiting on an answer", as AC8 needs. It uses `Object.hasOwn` and passes the answer as one argv item. The files changed match the plan, with no extras.
- `web/components/board.tsx:~75`: `mine` includes `working`, so every card whose job is running now shows a bordered `WorkingBanner` under its button, not only cards that just got an answer. build.md flags this and the plan asked for it, so it is not blocking. Consider limiting the banner to `sent !== null` or an asking card if the board feels noisy.
- `web/components/board.tsx` passes `() => {}` as the default `onCommand` to `useJobCommand` and always supplies `via`. It works, but it is a small smell. A later change could make `onCommand` optional in the hook.
- The `Actions` buttons are not shown on the board card, so the `send` lock is shared only through `useJobCommand`. This matches Req 8.
- Commits are short one-liners. The audit commit adds files under `factory/audit/`, which is the record and was skipped.
