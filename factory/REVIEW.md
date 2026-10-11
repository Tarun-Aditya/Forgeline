# Review guide

Every reviewer reads this before reviewing. The tech lead owns it. Edit it to
tune what the factory flags; agents may not.

## Review passes

Each reviewer owns one pass and stays inside it.

1. **Bugs and correctness** (code reviewer): does the diff do what `spec.md`
   requires, and does it match `plan.md`.
2. **Security** (security reviewer): access control, input handling, data
   exposure, secrets, dependencies.
3. **Experience** (ux and ui reviewers): the flow, the states and the look of
   anything a person sees.
4. **Policy** (every reviewer): anything that breaks a rule written in
   `AGENTS.md`, the spec's out-of-scope list or `factory/policy.json`.

## Important versus Nit

- **Important** (blocks, `VERDICT: CHANGES`): a bug a user or caller would hit, a
  spec requirement not met, a security weakness this change introduced or made
  worse, a failing check, a policy break, or a change the plan did not call for.
- **Nit** (goes under Notes, never blocks): taste, naming, formatting a linter
  does not enforce, optional tidying, and problems that already existed.

Cap Notes at five. If you have more, keep the five that matter most.

## Skip

- Generated files and lockfile churn, unless a dependency was added or changed.
- Files under `factory/audit/`: that is the record, not the change.
- Pre-existing issues the change did not touch or worsen. Mention at most one
  under Notes.

## Evidence

A finding names a file and line, says what goes wrong and for whom, and says the
fix you want. A finding you could not check says what you could not check.
