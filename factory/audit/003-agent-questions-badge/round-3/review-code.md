VERDICT: PASS

## Checks
- `cd web && npm test`: pass (40 tests, 40 pass, 0 fail)
- `cd web && npm run typecheck`: pass
- `policy_check.py . factory/003-agent-questions-badge`: only `ESCALATE-TRIGGER large change: 464 changed lines, cap is 400` (the merge with main raised it from 444). No weakened-bar lines.
- Not re-run: `npm run build` and the Python evals (build.md reports build pass and evals 354/354; the merge touched only web files).

## Findings
None.

## Notes
- The merge resolution is sound. `launchRun` keeps the `--` prompt fix from round 2 and adds `--resume <sessionId>` before it. `answer` is checked against `pendingQuestions`, so a stale or invalid job id is refused. `app-shell.tsx` now shares one `start()` between `submit` and `answer`, with `mcp` memoised, and `POST /api/runs` and `/api/chat` both pass `answer` through.
- build.md covers the AC 12 browser re-check on the merged code. The README line was updated to say an answer opens in the Runs panel.
- Worktree is clean. The only change outside `web/` is the USAGE.md addition and the audit files.
