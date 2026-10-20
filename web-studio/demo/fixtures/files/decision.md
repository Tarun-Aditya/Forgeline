APPROVE

## Why
This is an additive, backward-compatible GraphQL change: a new enum, a new output field and an optional argument with an SDL default. It is mirrored in the web queries and UI, and it touches no money, auth, CI, deploy, migration or dependency path. I re-ran lint and both test suites (lint exit 0, server 13/13, web 6/6 with `NODE_ENV=test`). I also tried to break the most likely weak spot, the `null` and invalid-variable paths into a non-null `priority` field, and could not. I ran a probe against the real `createApp`: `$priority: null` and an omitted variable both stored MEDIUM, `"URGENT"` and `"low"` both got HTTP 400 with an enum error, and the later `tasks` query resolved every priority with no null.

## Acceptance criteria
1. `npm run lint` passes: met. I re-ran it in the worktree at 2a03b3d and it exited 0.
2. `npm test -w server` with the four required tests: met. I re-ran it: 13 passed. The `describe('priority')` block in `server/src/schema.test.ts` has the LOW/MEDIUM/HIGH `it.each`, the omitted-priority test, the seeded-MEDIUM test and the URGENT test with count-stays-2. It also has a null guard test.
3. `npm test -w web` with the select, submit and badge tests: met. I re-ran it with `NODE_ENV=test`: 6 passed. The tests check option texts and values, the MEDIUM default, `onAdd('ship it','HIGH')` with the select resetting, and the `low` badge with classes `priority priority-low`. Plain `npm test -w web` fails in this shell because it has `NODE_ENV=production`. plan.md records the same failure on main at baseline, so the change does not cause it.
4. Text checks: met. I ran the grep myself and it printed lines 10, 20 and 32 of `server/src/schema.ts`. The diff shows `priority` in the `TASKS` selection and in `ADD_TASK` in `web/src/graphql.ts`.
5. Manual check at localhost:5173: met in substance. The builder ran the real app on its assigned port 5110 because 5173 and 4000 were held by other processes, and recorded the badges, the default, adding with high, distinct colours and the done-task badge. The UX and UI reviewers each opened the app independently and saw the medium badges and the select. The HTTP probe above backs up the server side.

## Plan adherence
The diff matches plan.md steps 1 to 9 file for file: `store.ts`, `schema.ts`, `schema.test.ts`, `graphql.ts`, `AddTaskForm.tsx`, `App.tsx`, `TaskItem.tsx`, `styles.css` and `components.test.tsx`. No files are outside the plan apart from the `factory/audit/001-task-priority/` trail. The only deviations are the manual check's port and harness (Vite middleware on 5110 instead of `npm run dev`), which build.md explains, and two cosmetic notes (line wrapping, and the test asserting option values too). The diff follows the spec's Design Decision and Interfaces exactly, including the SDL default, the store default and both `Priority` TS unions. It adds no dependency and no persisted schema; the store is in memory.

## Policy check
clean. `policy_check.py . factory/001-task-priority` printed `CLEAN` and exited 0. `git merge-tree --write-tree main factory/001-task-priority` returned tree 628d675 with no conflicts.

Other gates:
- All four round-1 reviews are `VERDICT: PASS` with no findings. Their notes are taste or pre-existing issues: badge margin on wrap, the unstyled select, the checkbox accessible name gaining the priority word, and no auth on the API from before this change.
- Spec Risk is `low`.
- `intent_required: true`. `intent.md` exists and `job.json` has `"intent_waived": null`. The job moved past the `intent` stage, which happens only through `/factory accept`, and a human approved the spec (`spec-approval.md`). The `INTENT: DRAFT` first line is the fixed header the intent-writer always writes.
- The audit trail on the branch has `spec.md`, `plan.md`, `build.md`, `intent.md`, `spec-approval.md`, `job.json` and all four `round-1/review-*.md`.
- I checked the definition-of-done ticks against the diff. No suppressions, skips or removed assertions: the only changed assertion was widened to `('write tests','MEDIUM')`. No dead or debug code. Old callers keep working: `add` gained only an optional parameter, and `addTask`'s new argument is optional with a default.
- None of the spec's Assumptions is a pricing, copy or paid-feature decision.

## Merge danger
- Door: two-way. Reverting the merge undoes it fully. There is no persisted data or migration, and the API change is additive.
- Blast radius: local. It changes the `Task` type and `addTask` in the server and the add form and task item in the web app. The only consumers are `server/src/app.ts`, `server/src/index.ts` and `web/src/App.tsx`, all accounted for.
- Evidence: build.md records red runs before the change (server 6 failed, web 4 failed). On the branch HEAD 2a03b3d I saw lint exit 0, server 13/13 and web 6/6. The probe returned `{priority:null}` → 200 MEDIUM, omitted → 200 MEDIUM, `"URGENT"` → 400 enum error, `"low"` → 400 enum error and `"HIGH"` → 200 HIGH, and then `tasks` listed all five tasks with non-null priorities.
