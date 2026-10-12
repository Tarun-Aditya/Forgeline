# Definition of done

A standing bar every job clears, whatever the spec says. Acceptance criteria answer
"did we build this thing?"; this answers "is it finished to our standard?". The tech
lead owns it. Edit it to fit the repo; agents may not.

The builder ticks it in build.md. Reviewers and the approver check the ticks against
the diff. A box that does not apply gets "n/a" and a few words, never a blank.

## Correctness
- [ ] Every acceptance criterion is met, observed on the real artifact, not just compiled.
- [ ] New behavior has a test that fails without the change and passes with it.
- [ ] Existing tests still pass; error paths and edge cases are handled.

## Quality
- [ ] No dead code, debug output or commented-out blocks.
- [ ] No duplicated logic where a helper exists; the change stays inside the spec.
- [ ] Lint and type-check pass on the changed files.
- [ ] No weakened bar: no new suppression, skipped test or removed assertion.

## Integration
- [ ] Callers and consumers of changed code were checked (see plan.md blast radius).
- [ ] Config, migrations and flags are accounted for, or the change is escalated.
- [ ] A public interface change keeps old callers working, or says why not.

## Documentation
- [ ] AGENTS.md and any doc it lists are updated where behavior changed.
- [ ] A decision worth keeping is in the spec's Design section.

## Ship readiness
- [ ] Untrusted input, auth and data handling were reviewed (the security pass).
- [ ] A new critical path logs enough to debug it, or build.md says it does not need to.
- [ ] A risky change has a rollback in plan.md.
