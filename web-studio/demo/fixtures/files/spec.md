# Task priority

> Feature: Add a priority (low, medium or high) to tasks. The GraphQL API should accept it when adding a task and return it on every task, and the web app should let the user pick it when adding a task and show it as a badge on each task. Default is medium.

- Ticket: none
- Risk: low. Additive, backward-compatible GraphQL field and optional argument on an in-memory store; no money, access, identity, CI, deploy or migration paths; covered by vitest in both packages.

## Context

- `server/src/store.ts`: `Task` interface (`id`, `title`, `done`, `createdAt`) and the in-memory `TaskStore`. `add(title)` creates every task, including the seed titles passed to the constructor (`server/src/index.ts` seeds two tasks). There is no persistence, so "existing tasks" are only the seeded ones and any added before a restart.
- `server/src/schema.ts`: SDL in `typeDefs` plus resolvers. `Task` type, `TaskFilter` enum (UPPERCASE values: `ALL`, `OPEN`, `DONE`), `addTask(title: String!): Task!`, which calls `store.add(validTitle(args.title))`. Validation errors are thrown as `GraphQLError`.
- `server/src/schema.test.ts`: vitest tests that call the yoga app through the `gql(query, variables)` helper.
- `web/src/graphql.ts`: hand-written `Task` TS interface, `Filter` type, and the `TASKS`, `ADD_TASK`, `TOGGLE_TASK` and `DELETE_TASK` documents. AGENTS.md says schema and web queries change together.
- `web/src/App.tsx`: runs `TASKS`, passes `onAdd={(title) => addTask({ title })...}` to `AddTaskForm`, and renders a `TaskItem` per task.
- `web/src/AddTaskForm.tsx`: controlled title input (`aria-label="New task"`) and an "Add" submit button. It trims the title, ignores empty ones, calls `onAdd(trimmed)` and clears the input.
- `web/src/TaskItem.tsx`: `<li>` with a checkbox, title `<span>` and a Delete button.
- `web/src/components.test.tsx`: Testing Library tests for `AddTaskForm` and `TaskItem`. Test files live under `src` and are type-checked by `npm run lint`.
- `web/src/styles.css`: plain global CSS; the filter buttons show the existing pattern of lowercasing UPPERCASE enum values for display (`f.toLowerCase()`).
- No `docs/` folder (no glossary, no ADRs). `factory/out-of-scope.md` has no entries. None of the files touched are frozen or escalate paths.

## Design

The change alters the GraphQL contract: a new enum type, a new field on `Task` and a new argument on `addTask`, used by both packages.

- **Decision**: Add a GraphQL enum `TaskPriority { LOW MEDIUM HIGH }`, matching the UPPERCASE style of `TaskFilter`. Add `priority: TaskPriority!` to `Task`, and an optional argument with a schema default to the mutation: `addTask(title: String!, priority: TaskPriority = MEDIUM): Task!`. The store keeps a `priority` on each `Task`, and `TaskStore.add(title, priority = 'MEDIUM')` defaults it, so seeded tasks and any task created without a priority are `MEDIUM`. GraphQL validation then rejects unknown values with no hand-written check. The web app sends and receives the UPPERCASE value and shows it lowercased, as it already does for filters.
- **Alternatives considered**:
  1. `priority: String` with a resolver check against `low|medium|high`. Not chosen: the allowed values would not appear in the schema, and it needs custom validation and error text that the enum gives for free.
  2. Lowercase enum values (`low`, `medium`, `high`) so the wire value matches the display text. Not chosen: it breaks the UPPERCASE enum convention that `TaskFilter` already uses, and the web app already lowercases enum values for display.
  3. Defaulting in the resolver (`args.priority ?? 'MEDIUM'`) with no SDL default. Not chosen: the SDL default documents the default in the schema for API clients. The store default is still needed for seeded tasks.
- **Consequences**: The change is additive. Existing clients that omit `priority` keep working, and every task now resolves a priority. The web `Task` interface and the queries in `web/src/graphql.ts` must be kept in step with the SDL by hand, because there is no codegen. Adding a priority value later means editing the enum, the TS union, the form options and the badge styles. There is nothing to migrate because the store is in memory.
- **Interfaces**:
  - SDL: `enum TaskPriority { LOW MEDIUM HIGH }`; `type Task { ... priority: TaskPriority! }`; `addTask(title: String!, priority: TaskPriority = MEDIUM): Task!`.
  - Server TS: `export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'` in `server/src/store.ts`; `Task.priority: Priority`; `TaskStore.add(title: string, priority?: Priority): Task`.
  - Web TS: `export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'` in `web/src/graphql.ts`; `Task.priority: Priority`; `AddTaskForm` prop `onAdd: (title: string, priority: Priority) => void`.

## Requirements

1. `server/src/store.ts` exports `Priority`, and `Task` has a `priority: Priority` field. `TaskStore.add(title, priority = 'MEDIUM')` stores it. Seeded tasks are `MEDIUM`.
2. `server/src/schema.ts` defines `enum TaskPriority { LOW MEDIUM HIGH }`, adds `priority: TaskPriority!` to `Task`, and changes the mutation to `addTask(title: String!, priority: TaskPriority = MEDIUM): Task!`. The resolver passes `args.priority` through to `store.add`. Title validation is unchanged.
3. An unknown priority value (an invalid enum literal or variable) makes the request fail with a GraphQL error and adds no task.
4. `web/src/graphql.ts` exports `Priority` and adds `priority: Priority` to `Task`. `TASKS` selects `priority`. `ADD_TASK` takes `$priority: TaskPriority` and passes it to `addTask`, and also selects `priority`.
5. `AddTaskForm` renders a `<select>` with accessible label "Priority" and exactly three options, in this order and with these texts and values: "low" (`LOW`), "medium" (`MEDIUM`), "high" (`HIGH`). "medium" is selected initially. Submitting calls `onAdd(trimmedTitle, priority)`, clears the title and resets the select to medium. An empty title still submits nothing.
6. `App.tsx` passes the chosen priority to the mutation: `onAdd={(title, priority) => addTask({ title, priority }).then(reload)}`.
7. `TaskItem` shows a badge for the task's priority: a `<span>` with class `priority priority-<low|medium|high>`, whose visible text is the lowercased value ("low", "medium" or "high"). The badge appears on every task, whether done or not.
8. `web/src/styles.css` styles `.priority` as a small pill and gives each of `.priority-low`, `.priority-medium` and `.priority-high` its own background or text colour. The text label stays the main cue, and colour only supports it. Text in each badge has a contrast ratio of at least 4.5:1 against its background.
9. Tests:
   - In `server/src/schema.test.ts`, add tests for: adding with each of `LOW`, `MEDIUM` and `HIGH` returns that priority; adding without a priority returns `MEDIUM`; `{ tasks { priority } }` returns `MEDIUM` for the seeded tasks; an invalid priority returns `errors` and the task count does not change.
   - In `web/src/components.test.tsx`, add tests for the select's options and default, for submitting with a chosen priority, and for the badge text. Update the existing `TaskItem` fixture and `onAdd` assertions to include `priority`.
10. `README.md` needs no change. AGENTS.md needs no change, because no new commands or paths are added.

## Acceptance criteria

1. `npm run lint` passes, with no type errors in either package.
2. `npm test -w server` passes and includes tests that show each of the following:
   - `mutation { addTask(title: "x", priority: HIGH) { priority } }` returns `"HIGH"`, and the same holds for `LOW` and `MEDIUM`.
   - `mutation { addTask(title: "x") { priority } }` returns `"MEDIUM"`.
   - `{ tasks { priority } }` on a store seeded with `['one', 'two']` returns `MEDIUM` for both.
   - `mutation { addTask(title: "x", priority: URGENT) { id } }` returns a non-empty `errors`, and `{ tasks { id } }` still returns two tasks afterwards.
3. `npm test -w web` passes and includes tests that show each of the following:
   - `getByLabelText('Priority')` is a select whose options read exactly `low`, `medium`, `high`, with `medium` selected.
   - When the user picks "high", types a title and clicks Add, `onAdd` is called with `('<title>', 'HIGH')` and the select goes back to medium.
   - `TaskItem` rendered with `priority: 'LOW'` shows the text `low` in an element with class `priority-low`.
4. `server/src/schema.ts` contains `enum TaskPriority`, `priority: TaskPriority!` on `Task`, and `priority: TaskPriority = MEDIUM` on `addTask`. `web/src/graphql.ts` selects `priority` in `TASKS`.
5. Manual check: run `npm run dev` and open http://localhost:5173. The two seeded tasks show a "medium" badge. The form has a Priority select that defaults to medium. Adding a task with "high" shows it with a "high" badge. The low, medium and high badges have different colours.

## Out of scope

- Editing a task's priority after it is created, such as a `setPriority` mutation or an edit control (intent: decided no).
- Sorting or filtering tasks by priority, in the API or in the UI (intent: decided no).
- Persisting tasks or adding any migration, since the store stays in memory.
- GraphQL codegen or any new dependency.
- Changes to `toggleTask`, `deleteTask`, `task(id)` or the existing filter behaviour, apart from `priority` now being resolvable on the returned `Task`.

## Assumptions

- The API uses UPPERCASE enum values (`LOW`, `MEDIUM`, `HIGH`) and the UI shows them lowercase. This matches the existing `TaskFilter` convention. The request's "low, medium or high" is read as the set of values, not their exact casing.
- An invalid value is rejected, not mapped to medium, as answered in the intent. GraphQL enum validation provides the error, so the spec does not fix its message text.
- Existing and seeded tasks are medium, as answered in the intent.
- Badges show text plus colour, and colour is not the only cue, as answered in the intent. The exact colours are left to the builder within the contrast requirement.
- After a successful add, the form resets the select to medium, just as it clears the title. Reason: each new task starts from the stated default.
- The badge appears on done tasks too, because the request says "each task".
