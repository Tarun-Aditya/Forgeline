STATUS: READY

# Build: Task priority

## Summary
Tasks now have a priority of LOW, MEDIUM or HIGH, and the default is MEDIUM. The GraphQL API has `enum TaskPriority`, `Task.priority: TaskPriority!` and `addTask(title: String!, priority: TaskPriority = MEDIUM)`. The store defaults to `'MEDIUM'`, so seeded tasks are MEDIUM. The web form has a "Priority" select that defaults to medium and resets to medium after each add. Every task shows a coloured badge with the lowercased priority as its text.

Commits (on `factory/001-task-priority`):
- `70127f9` Add task priority to the GraphQL API
- `bc16a07` Pick task priority in the web form and show it as a badge

Files changed:
- `server/src/store.ts`
- `server/src/schema.ts`
- `server/src/schema.test.ts`
- `web/src/graphql.ts`
- `web/src/AddTaskForm.tsx`
- `web/src/App.tsx`
- `web/src/TaskItem.tsx`
- `web/src/styles.css`
- `web/src/components.test.tsx`

## Acceptance criteria
1. [x] `npm run lint` passes: it ran at the root and exited 0. `tsc --noEmit` is clean for both server and web, test files included.
2. [x] `npm test -w server` passes with 13/13 tests. The new `describe('priority')` covers:
   - `it.each` for LOW, MEDIUM and HIGH, each round-tripping `addTask(title: "x", priority: P) { priority }`.
   - An omitted priority returns `MEDIUM`.
   - An explicit `null` returns `MEDIUM` (the plan's extra guard).
   - Seeded `['one','two']` give `[{priority:'MEDIUM'},{priority:'MEDIUM'}]`.
   - `priority: URGENT` returns non-empty `errors` with no `data.addTask`, and `{ tasks { id } }` still has length 2.

   Red run before the code change: 6 failed, 7 passed. The URGENT test already passed at baseline, because `priority` was an unknown argument then. After the change it passes because of enum validation.
3. [x] `NODE_ENV=test npm test -w web` passes with 6/6 tests. The new or updated tests are:
   - The select's options read exactly `low, medium, high` with values `LOW, MEDIUM, HIGH`, it is an `HTMLSelectElement`, and its value is `MEDIUM`.
   - Picking HIGH, typing "ship it" and clicking Add calls `onAdd('ship it','HIGH')`, and the select goes back to `MEDIUM`.
   - A `TaskItem` with `priority:'LOW'` shows a `low` element with the classes `priority priority-low`.
   - The existing assertion is now `onAdd('write tests','MEDIUM')`, and the fixture includes `priority:'MEDIUM'`.

   Red run before the code change: 4 failed, 2 passed.
4. [x] The grep on `server/src/schema.ts` printed three lines:
   - `10: priority: TaskPriority!`
   - `20: enum TaskPriority {`
   - `32: addTask(title: String!, priority: TaskPriority = MEDIUM): Task!`

   The grep on `web/src/graphql.ts` shows `priority` on line 20, inside the `TASKS` selection, and on lines 26–29 in `ADD_TASK`.
5. [x] Manual check in a real browser (agent-browser, session `001-task-priority-builder`), at http://localhost:5110 instead of 5173. The reason is under Plan adherence. Results:
   - The two seeded tasks showed a "medium" badge.
   - The combobox "Priority" listed low/medium/high, with medium selected.
   - I added "Urgent fix" with high, and it showed a "high" badge. I added "Low thing" with low, and it showed a "low" badge. After each add, the select's value was back to `MEDIUM`.
   - I toggled a seeded task to done. Its title was struck through, but its badge kept `text-decoration: none` and its own colours.
   - Computed styles: medium has bg `rgb(253,239,200)` and text `rgb(92,61,0)`. High has `rgb(251,220,220)` and `rgb(139,26,26)`. Low has `rgb(220,239,220)` and `rgb(30,70,32)`. All three differ.
   - A WCAG relative-luminance script run on those computed colours printed `low 8.93`, `medium 8.65` and `high 7.24`. All are at least 4.5:1.
   - I also sent `URGENT` as a variable over HTTP. It returned 400, and the task count stayed the same.

## Validation
- `npm run lint` (root): passed.
- `npm test -w server`: passed (13 tests).
- `NODE_ENV=test npm test -w web`: passed (6 tests).
- Plain `npm test -w web` fails with "act(...) is not supported in production builds of React". This shell has `NODE_ENV=production`, and the same failure happens on `main` at baseline, as plan.md's Risks section records. It is not caused by this change.
- `callers.py .` hits:
  - `buildSchema` in `server/src/app.ts:2,6`. The signature is unchanged.
  - `TaskStore` in `server/src/app.ts:3,5` and `server/src/index.ts:3,6`. These are constructor calls only. `add` gained only an optional parameter, so the seeds become MEDIUM.

  No hits outside `server` and `web`.

## Definition of done
Correctness:
- [x] Every criterion was observed on the real artifact: test runs, lint, grep, a live browser and HTTP calls.
- [x] New behaviour has tests that failed before the change (the red runs are recorded above) and pass after it.
- [x] Existing tests still pass. The error paths covered are an invalid literal (test), an invalid variable (checked over HTTP), explicit null (test) and an empty title (unchanged test).

Quality:
- [x] No dead code, debug output or commented-out code.
- [x] No duplicated logic. The UI lowercases enum values the same way the filters already do. The change stays inside the spec.
- [x] Lint and type-check pass.
- [x] No suppressions, skipped tests or removed assertions. The one changed assertion was widened to include the new argument, as the spec requires.

Integration:
- [x] Callers were checked with `callers.py` (see Validation).
- [x] Config, migrations and flags: n/a. There are none, and the store is in memory.
- [x] Old callers keep working. `priority` is optional with an SDL default, and `Task.priority` is a new output field.

Documentation:
- [x] AGENTS.md: n/a. There are no new commands or paths, and spec requirement 10 says no change.
- [x] The decision is recorded in the spec's Design section.

Ship readiness:
- [x] Untrusted input: GraphQL enum validation rejects unknown values before the resolver runs, and `null` is turned into the default. No auth or identity paths are touched.
- [x] Logging: n/a. This is not a new critical path, and a rejection returns a standard GraphQL error.
- [x] Rollback: plan.md says to revert the merge commit. There is no data to migrate.

## Plan adherence
- Steps 1 to 9 were done as planned, with the same code, CSS values and test shapes. Two notes:
  - In step 9, the option check asserts both texts and values.
  - The resolver in step 2 is wrapped over two lines to fit the line length.
- Manual check, Proof item 5: I did not run `npm run dev` itself. Ports 4000 and 5173, which the server and vite.config hard-code, were already held by another process on this machine (PIDs 73191 and 73156, not mine). Running `npm run dev` would have collided with them, and I was assigned port 5110.
  - Instead, a throwaway Node process started from `web/` ran Vite in middleware mode with `@vitejs/plugin-react`. It served the real `web/` app and routed `/graphql` to the real `createApp(new TaskStore([...same seeds as index.ts]))` loaded from `server/src/app.ts`. Everything ran on port 5110.
  - No repo config was changed. The process was stopped afterwards.
- Files changed outside plan.md: none.
- `git status --porcelain` shows `?? node_modules`. That is the symlink created by the factory's `worktree_setup.link`: the `.gitignore` pattern `node_modules/` does not match a symlink. I did not create it, and I left it alone.

## Skills used
None. `tdd`, `diagnosing-bugs`, `verify-app` and `codebase-design` are not installed in this session. I followed red then green by hand for each package, and used `agent-browser` for the page check.

## Log
### Round 1
- Server: wrote the `priority` tests and saw them fail (6 red), then made the store and schema changes and saw them pass (13 green). Lint was clean. Committed as `70127f9`.
- Web: updated and added the component tests and saw them fail (4 red), then made the `graphql.ts`, `AddTaskForm`, `App`, `TaskItem` and `styles.css` changes and saw them pass (6 green). Root lint was clean. Committed as `bc16a07`.
- Ran `callers.py`, the grep checks, the live browser check on port 5110, the contrast script and the HTTP check for an invalid variable. Closed the browser session and stopped the server.
