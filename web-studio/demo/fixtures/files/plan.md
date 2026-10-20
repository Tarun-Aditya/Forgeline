PLAN: READY

# Plan: Task priority

## Approach
Follow the spec's Design exactly. Server: the `Task` record in the in-memory `TaskStore` gets a
`priority`, and `add(title, priority = 'MEDIUM')` is the single place that sets the default, so
seeded tasks come out `MEDIUM`. The SDL adds `enum TaskPriority { LOW MEDIUM HIGH }`,
`priority: TaskPriority!` on `Task`, and `priority: TaskPriority = MEDIUM` on `addTask`. GraphQL
validation rejects unknown values before the resolver runs, so we write no check of our own. Web:
`graphql.ts` mirrors the type and selects the field. `AddTaskForm` gets a controlled `<select>`.
`TaskItem` renders a lowercased badge, and `styles.css` colours it.

We chose this over a string field with a resolver check (the spec's alternative 1) because the
enum puts the allowed values in the schema and gives the rejection for free. I checked the enum
behaviour against the pinned versions (graphql 16.9.0, graphql-yoga 5.7.0 in `node_modules`) with
a throwaway yoga schema:
- The literal `URGENT` gives HTTP 200 with `errors` ("Value \"URGENT\" does not exist in ... enum."), and the resolver does not run.
- The variable `URGENT` gives HTTP 400 with `errors`, and the resolver does not run.
- An omitted argument or an omitted variable makes the resolver receive `'MEDIUM'` (the SDL default is applied).
- An explicit `priority: null` makes the resolver receive `null`. The SDL default does not apply, and a JS default parameter does not apply to `null` either.

The resolver must therefore turn `null` into `undefined` (`args.priority ?? undefined`).
Otherwise `store.add` would save `null`, and every later `tasks` query would fail the non-null
`priority: TaskPriority!` field. That is one token and still "passes args.priority through".

## Steps
Package `server`:
1. `server/src/store.ts`: add `export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'`. Add `priority: Priority` to `interface Task`. Change `add(title: string, priority: Priority = 'MEDIUM'): Task` and set `priority` in the created object. The constructor's `seed.forEach((title) => this.add(title))` stays as it is, and its tasks default to `MEDIUM`.
2. `server/src/schema.ts`:
   - In `typeDefs`, add `enum TaskPriority { LOW MEDIUM HIGH }` (next to `TaskFilter`), add `priority: TaskPriority!` to `type Task`, and change the mutation to `addTask(title: String!, priority: TaskPriority = MEDIUM): Task!`.
   - Import `type Priority` from `./store` (alongside `TaskStore`).
   - Change the `addTask` resolver to `(_: unknown, args: { title: string; priority?: Priority | null }) => store.add(validTitle(args.title), args.priority ?? undefined)`.
   - Title validation stays unchanged. No `Task.priority` field resolver is needed, because the default resolver reads the property.
3. `server/src/schema.test.ts`: add a `describe('priority', ...)` block that uses the existing `gql` helper and the `['one', 'two']` seed:
   - `it.each(['LOW', 'MEDIUM', 'HIGH'])`: `mutation { addTask(title: "x", priority: ${p}) { priority } }` returns `p`.
   - Without a priority: `mutation { addTask(title: "x") { priority } }` returns `'MEDIUM'`.
   - Seeded: `{ tasks { priority } }` returns `[{ priority: 'MEDIUM' }, { priority: 'MEDIUM' }]`.
   - Invalid: `mutation { addTask(title: "x", priority: URGENT) { id } }` returns `errors` with length > 0 and no `data.addTask`. After that, `{ tasks { id } }` has length 2.
   - Explicit null: `mutation { addTask(title: "x", priority: null) { priority } }` returns `'MEDIUM'`. This guards the `?? undefined` from the Approach.

Package `web`:
4. `web/src/graphql.ts`: add `export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'`. Add `priority: Priority` to `interface Task`. Add `priority` to the `TASKS` selection. Change `ADD_TASK` to `mutation AddTask($title: String!, $priority: TaskPriority) { addTask(title: $title, priority: $priority) { id priority } }`. Leave `TOGGLE_TASK` and `DELETE_TASK` as they are.
5. `web/src/AddTaskForm.tsx`:
   - Change the prop to `onAdd: (title: string, priority: Priority) => void` (import `type Priority` from `./graphql`).
   - Add state `const [priority, setPriority] = useState<Priority>('MEDIUM')`.
   - Between the input and the button, render `<select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>` with three options in order: `<option value="LOW">low</option>`, `<option value="MEDIUM">medium</option>`, `<option value="HIGH">high</option>`.
   - On submit, keep the existing trim and empty check. Then call `onAdd(trimmed, priority)`, `setTitle('')` and `setPriority('MEDIUM')`.
6. `web/src/App.tsx`: change line 25 to `onAdd={(title, priority) => addTask({ title, priority }).then(reload)}`. Nothing else changes.
7. `web/src/TaskItem.tsx`: inside the `<label>`, after the title `<span>`, add `<span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span>`. Keeping it inside the label leaves the `li`'s two-child flex layout (label and Delete button) as it is.
8. `web/src/styles.css`:
   - Add `.priority { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }`.
   - Add the three colour pairs:
     - `.priority-low { background: #dcefdc; color: #1e4620; }` (8.93:1)
     - `.priority-medium { background: #fdefc8; color: #5c3d00; }` (8.65:1)
     - `.priority-high { background: #fbdcdc; color: #8b1a1a; }` (7.24:1)

     I computed these WCAG ratios with the relative-luminance formula. All of them are at least 4.5:1.
   - Change `li.done span` to `li.done span:not(.priority)`. Without this, the existing rule (specificity 0,1,2) beats `.priority-*` (0,1,0). It would strike through the badge on done tasks and turn its text `#8a94a3`, which fails the 4.5:1 contrast requirement.
9. `web/src/components.test.tsx`:
   - Update the existing `onAdd` assertion to `toHaveBeenCalledWith('write tests', 'MEDIUM')`.
   - Update the `TaskItem` fixture to `{ id: '7', title: 'ship', done: false, priority: 'MEDIUM' }`. Without this, lint fails, because test files are type-checked.
   - Add a test that `getByLabelText('Priority')` is a `HTMLSelectElement`, that its option texts are `['low', 'medium', 'high']`, and that it has the value `'MEDIUM'` (`toHaveValue('MEDIUM')`, or `getByRole('option', { name: 'medium' })` with `selected === true`).
   - Add a test that calls `userEvent.selectOptions(getByLabelText('Priority'), 'HIGH')`, types `'ship it'`, clicks Add, and then expects `onAdd` to have been called with `('ship it', 'HIGH')` and the select to have the value `'MEDIUM'`.
   - Add a test that renders `TaskItem` with `priority: 'LOW'` and checks that `screen.getByText('low')` has the class `priority-low` (and `priority`).

## Proof
1. `npm run lint` passes: run `npm run lint` at the root. It covers both packages and the test files.
2. `npm test -w server`, each part:
   - LOW, MEDIUM and HIGH round-trip: new `it.each` in `describe('priority')`.
   - No priority returns MEDIUM: new test.
   - Seeded tasks are MEDIUM: new test.
   - URGENT gives errors and the count stays 2: new test.
   - (Extra guard, not a criterion) An explicit null gives MEDIUM: new test.
3. `npm test -w web`, each part:
   - Select options and default: new test.
   - Pick high, submit, `onAdd('<title>', 'HIGH')`, reset to medium: new test.
   - The badge `low` has `priority-low`: new test.
   - The existing three tests are updated and still pass.
4. Text check:
   - Run `grep -n "enum TaskPriority\|priority: TaskPriority!\|priority: TaskPriority = MEDIUM" server/src/schema.ts`. It should print three lines.
   - Run `grep -n priority web/src/graphql.ts`. It should show the field in the `TASKS` selection.
5. Manual check: run `npm run dev` and open http://localhost:5173.
   - The two seeded tasks show "medium".
   - The Priority select defaults to medium.
   - Adding a task with "high" shows a "high" badge.
   - The three badges have different colours.
   - Toggling a task to done leaves its badge unstruck and in its own colours.

The server and web tests above are new, apart from the two updated web tests.

## Blast radius
Packages touched: `server` and `web`. Neither depends on the other in code (`monorepo.py detect`
shows `depends_on: []` for both). They are coupled only through the GraphQL contract at runtime,
and this change updates both sides of it together.

Callers (from `callers.py`, with each hit opened):
- `server/src/index.ts:6`: `new TaskStore([...two titles])`. The seeds go through `add(title)` with no priority, so they become `MEDIUM`. The call does not change.
- `server/src/app.ts:5`: `new TaskStore()`. No seed and no change. `app.ts:2,6`: `buildSchema(store)`. The signature does not change.
- `AddTaskForm`, `TaskItem` and `graphql.ts` exports are used only by `web/src/App.tsx` and `web/src/components.test.tsx`. Both are in this plan.

Hits I ruled out: the matches for the common words `task`, `title`, `before`, `open`, `done` and `yoga` are prose in `.claude/**`, `README.md` and `web/index.html`, not code. The `TaskStore.add` signature only gains an optional parameter, so every existing call stays valid.

Why the change is safe:
- Adding an optional argument with a default, plus a new output field, is backward compatible for existing GraphQL clients. I ran this against yoga 5.7.0: with the argument omitted, the resolver receives `'MEDIUM'`.
- Unknown values never reach the store. I ran this: for both the literal and the variable form, the resolver did not run and `errors` came back. The new server test runs the real schema for it.
- The `null` path. I walked it through and ran it: the resolver receives `null`, and the `?? undefined` covers it. The new null test runs the real code for it.

## Policy flags
- Frozen paths this plan would need to edit: none.
- Escalate paths it touches: none.
- New dependencies: none. `package.json` and `package-lock.json` are untouched.

## Risks and rollback
- Risk is low, per the spec.
- **Environment:** the shell here has `NODE_ENV=production`. With it, `npm test -w web` fails at baseline on `main` too ("act(...) is not supported in production builds of React"), on all three existing tests. With `NODE_ENV=test` they pass. This is not caused by this change. The builder should run the web tests with `NODE_ENV=test` and say so in the build notes. Server tests and lint pass either way.
- **Cache:** `ADD_TASK` now selects `priority` as well as `id`. urql's document `cacheExchange` invalidates by `__typename`, so `TASKS` is refetched exactly as it is today.
- **Accessibility:** the badge sits inside the checkbox's `<label>`, so the checkbox's accessible name becomes e.g. "ship medium". Existing tests query the checkbox by role without a name, so they still pass.
- **Rollback:** revert the merge commit. There is no data or migration, because the store is in memory.

## Validation
- `npm install` (root, only if `node_modules` is missing)
- `npm run lint`
- `npm test -w server`
- `NODE_ENV=test npm test -w web` (see Risks)
- `npm run dev` for the manual check in Proof item 5
