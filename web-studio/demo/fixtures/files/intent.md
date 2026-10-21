INTENT: DRAFT

# Add a priority to tasks

- Origin: idea
- Ticket: none
- Originator: not given

## In the originator's words
> Add a priority (low, medium or high) to tasks. The GraphQL API should accept it when adding a task and return it on every task, and the web app should let the user pick it when adding a task and show it as a badge on each task. Default is medium.

## Problem
Tasks have no way to express how important they are, so users of the web app cannot tell at a glance which tasks matter most. API clients cannot record or read importance either.

## Who is affected
People who add and view tasks in the web app, and any client of the GraphQL API. Volume is not stated.

## Constraints
- Allowed priority values are low, medium and high.
- Default is medium when none is given.
- Tasks that already exist must still work and be returned with a priority.
- No entry in `factory/out-of-scope.md` conflicts with this request.

## Success criteria
- Adding a task through the API with priority low, medium or high returns a task with that priority.
- Adding a task through the API without a priority returns a task with priority medium.
- Every task returned by the API, including existing ones, has a priority.
- In the web app, the add-task form offers exactly low, medium and high, with medium preselected.
- Every task shown in the web app displays its priority as a badge, and the badge for each of the three values is visibly distinguishable.
- An invalid priority value is rejected by the API.
- Existing server and web tests still pass, with new tests covering the above.

## Assumptions
- (guess) Priority is a fixed set of three values, not user-defined.
- (guess) Priority is set only when adding a task; editing it afterwards is not requested.
- (guess) Existing tasks are treated as medium.
- (guess) "Badge" means a small text label, with colour as an optional aid.

## Open questions
- Should users be able to change a task's priority after it is added? [No, not in this change]
- Should tasks be sorted or filterable by priority? [No, not in this change]
- What should existing tasks show? [medium]
- Should the API reject an unknown priority value, or fall back to medium? [Reject]
- Is colour required for the badges, or is text alone enough? [Text plus colour, but colour not required]
