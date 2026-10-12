# Audit against the AI-Native SDLC Playbook (fourth pass: after comparing with super-board)

Scored on what was built and run. "Run" means exercised for real: the offline
evals (326 checks), the live agent evals (17 cases against the real
Claude CLI) and live runs on a fixture repo.

Status: **Covered** (built and run), **Partial** (built, with a stated hole),
**Gap** (not built).

| # | Stage | Play | Status | Evidence and the hole |
| --- | --- | --- | --- | --- |
| 1 | Plan | `intent.md` | Covered | Required by default (`policy.intent_required`), enforced in `jobctl.py`; a waiver needs a person's reason and the approver escalates it. Run live. |
| 2 | Design | Requirements / design spec | Covered | `spec.md` has a Design section (decision, two named alternatives, consequences, interfaces) for architectural changes. Planner and approver check it. Live agent case passes. |
| 3 | Build | Plan mode | Covered | `planner` writes `plan.md` before code. It is an agent, not Claude Code's built-in plan mode. |
| 4 | Build | Auto mode | Covered | Verified live that `git push` is blocked by the hooks while running in auto mode. `install.py --default-mode auto` sets it for everyone. Builder and reviewer evals run in auto mode. |
| 5 | Build | `CLAUDE.md` | Covered | `doctor.py` checks AGENTS.md covers setup, tests, build, dev server, layout, conventions and what not to touch; `onboarder` drafts one (live case: uses real commands, says UNKNOWN for the port it cannot find). |
| 6 | Build | Skills | Covered | Orchestrator, five team skills, and five pinned MIT helper skills (tdd, diagnosing-bugs, codebase-design, code-review, grilling) that the builder, planner and reviewers use. Live: with them installed, the builder called `tdd` before editing. The five team skills' structure is checked; their procedures have not been run on a real task. |
| 7 | Build | Hooks as guardrails | Covered | Frozen paths, test lock, secrets scan, push gate. Hard enforcement still needs an admin to run `managed/install.py` (tested in a temp directory). |
| 8 | Build | Parallel sessions and subagents | Covered | One worktree per job, parallel jobs, 14 subagents. |
| 9 | Test | Feedback loop | Covered | Build check, review rounds, resume, failing-test-first. The builder ran live (implements, tests, commits within the plan). No full feature has gone through every agent in one run. |
| 10 | Test | Continuous evals | Partial | 17 live agent cases cover 12 of the 14 agents, plus 326 offline checks. Not covered: `reviewer-ux` and `reviewer-ui`, which need the `agent-browser` CLI. The weekly run is scheduled by `schedule.py`; it was tested against a crontab file, not installed (no cron here). |
| 11 | Deploy | AI in the PR review loop | Partial | `review_branch.py` reviews any branch or PR with a read-only agent, drops comments that are not on diff lines, and prepares the `gh` command. Run live. It does not trigger by itself when a PR opens and never posts: both need CI or a webhook, which was left out. |
| 12 | Deploy | Hooks as approval gates | Covered | Push, deploy and publish blocked unless a person sets the variable. `merge_gate.py` is now the only way to main: approval is bound to a commit, a frozen-path edit is always refused, escalation triggers and a size cap need a human even after APPROVE, and `verify_commands` run on the merged result under a lock. 36 offline checks, mutation-tested. A hook blocks hand merges of factory branches. |
| 13 | Deploy | CI/CD integration, tiered autonomy, rollback | Gap | Left out on purpose. The merge gate gives tiered autonomy locally (auto-merge only under the size cap and policy), but there is no pipeline, deploy or rollback automation. |
| 14 | Maintain | Maintenance loop | Covered | `collect.py` (command, HTTP JSON, log rate, git, factory) feeds the bands; detection, diagnosis, runbook gating, incident to intent and dismissals ran live. You must enable the collectors that point at your service. |
| 15 | Maintain | Recurring codebase scans | Covered | Four lenses (security, quality, secrets in files and history, dependencies) ran live with `--lens all`; recurring tracking, triage to backlog, dismissals; cron block from `schedule.py`. |
| 16 | Maintain | Claude on call (Claude Tag) | Gap | A hosted product, not files. |

Outside the 16 plays: Jira / ServiceNow connector is a gap, left out on purpose.

Totals: 12 covered, 2 partial, 2 gaps.

## Borrowed from super-board

Merge gate with a lock and verification on the current base, commit-bound approval,
size cap, stop and resume, and the helper-skills approach. Deliberately not ported:
running database migrations automatically (deploy-adjacent and risky), the GitHub
Project board as the state store, and model routing by difficulty (not needed on a
subscription).

## Still unproven

- One complete job has now run through every agent in one go (fixture repo, below), but it was
  small, low risk and passed review in round 1. No CHANGES round, ESCALATE, rework or UI job
  has run end to end.
- `/factory stop` cannot kill a subagent that is already running; it pauses the next stage.
- `reviewer-ux` and `reviewer-ui` have never run (no `agent-browser`).
- Managed settings and cron were tested against files, not installed on a machine.
- The HTTP and log collectors are tested against local fixtures, not your service.
- Agent evals depend on model output; two fixture mistakes of mine were found by
  agents being right, so expect the occasional flaky result.

## End-to-end run (2026-10-11)

A fixture Python library with a feature, `apply_discount` input validation, ran through
`/factory intent` → `accept` → `approve-spec` with nested `claude -p` sessions in auto mode.
Intent, spec approval and acceptance were given by the test operator, not a product owner.
Result: intent, spec, plan, build, four reviews (all PASS, round 1), approver APPROVE, then
`merge_gate.py` merged with `verify_commands` run and no NO VERIFY note. About 9 minutes from
spec approval to merge. The job was typed `bugfix`, so the failing-test-first commit and test
lock were exercised.

The new prompts took effect: build.md carries a ticked Definition of done and the red/green
runs; the planner labelled its safety evidence; the approver named the claim it doubted, ran
three checks itself, and wrote the Door / Blast radius / Evidence block. Reviewer-ux and
reviewer-ui correctly reported no UI. Not shown: the weakened-bar scan firing on a real job,
a CHANGES round, an escalation.

Second job, same fixture: add a GitHub Actions workflow that runs the tests. The spec-writer
rated it `Risk: high`; all four round-1 reviews passed; the approver wrote ESCALATE because
`.github/**` is an escalate path, and the job stopped at needs-human with no merge. A test-
operator `/factory rework` asked for `persist-credentials: false` (the security reviewer's
note); the builder made it, round 2 ran, the approver escalated again, and `/factory approve`
then merged through the gate (exit 0, verify run). That exercised escalate, rework, a second
review round, human approval and the gate's human-approved path.

Found by that run: in round 2 `reviewer-code` said PASS in its message but did not write
`review-code.md`, reading a generic "no report files" rule as covering its deliverable. The
orchestrator correctly held the round open. A re-run wrote it. Fix: each reviewer and the
approver now states that the output file is the assigned deliverable. One miss in two jobs,
so watch for it. The run was also cut off once by the subscription session limit and resumed
from files with no loss. Still not shown: a CHANGES round, the weakened-bar scan firing on a
real job, a UI job.

### Run A: a split job (Sonnet, same fixture)

A larger feature (a shopping cart, a checkout summary and a CLI) was given as one intent. The
spec-writer wrote a `## Split` section with three slices; after the human approved the spec the
orchestrator created three children that inherited the intent, with dependencies. `/factory
ready` started only the first; each next child was specced only after its dependency merged and
its spec cited the earlier ADR and the merged code. Every child passed review in round 1 and
merged through the gate, and the parent closed itself after the last. The gate ran the
test-count ratchet (8, then 30, then 41, then 63 tests; a person raised the baseline each
time) and committed two ADRs (`docs/adr/0001`, `0002`); a child whose spec was not
architectural wrote none. The glossary and out-of-scope file were read (the CLI spec cites
`out-of-scope.md`).

Found by this run:
- The gate refused a dirty main checkout. It was the test setup (an uncommitted file), and the
  orchestrator correctly left it alone.
- `reviewer-ux` returned PASS in its message without writing its file, saying it "judged the
  write unnecessary for a PASS". The first fix (a deliverable line) was too weak. Reviewers now
  say to write the file on every outcome, and the orchestrator re-spawns a reviewer that
  finishes without its file once before asking a person. The re-spawn rule worked on its first
  use.
- Non-blocking review notes do not reach the next slice. A note that `Cart` accepts NaN and
  infinity, raised by security, code review and the approver on the first slice, was reported to
  the human but the CLI slice's spec put NaN handling out of scope. Open question: carry
  unresolved notes into a follow-up backlog item automatically.

### Run B: a CHANGES round (Sonnet, same fixture)

B1 (export a cart summary to any path the caller gives) passed review in round 1: the security
reviewer noted the arbitrary-path write and symlink following as non-blocking because the spec
asked for it. The approver's conflict check was blocked by a hook rule that matched
`git merge-tree` and `git merge-base` as if they were `git merge`; the pattern is fixed
(`merge(?![\w-])`) with evals. The merge recorded ADR 0003, which noted it departs from ADR 0002.

B2 was fault injection, because B1 did not produce a CHANGES round: a hand-built job whose branch
had a real bug (a negative cap was not rejected), a skipped test hiding it, a `# noqa`, and a
build log that ticked "no weakened bar" and dropped `skipped=1` from the test output. Result:
`policy_check.py` flagged the suppression and the skipped test; security and code reviewers
returned CHANGES and caught all three, and code review also caught the dishonest build log;
a fresh builder fixed everything (reusing `apply_discount`'s validation instead of copying it);
round 2 passed on all four; the approver wrote APPROVE and the gate merged it. `lessons.py`
read the real review files and grouped them; its fix suggestions were crude and the hint table
was improved (a suppression now points at the existing weakened-bar scan). Repeats across jobs
are still needed to show grouping on real data.

### Run C: UI jobs (Sonnet, same fixture, `agent-browser` 0.39.0 with the installed Chrome)

The fixture gained a small web page (`src/cart_web.py`, a stdlib server). `/factory init` made the
onboarder draft `VERIFY.proposed.md`: accurate, with the real start command, ready check and a
feature map. A person installed it as `.claude/skills/verify-app/SKILL.md`; doctor then passed
its check. C: a job making the empty cart state clearer. The builder followed `verify-app` and
drove the live page in `agent-browser`. But `reviewer-ux` and `reviewer-ui` did not open the page:
they called the renderer and read the HTML and passed. Cause: both lacked the Skill tool, and "if
the change shows up on a page" left room to decide it did not. Fixed: both now have the Skill
tool, read `.claude/skills/verify-app/SKILL.md` first, and must open the page when the diff
changes what it renders (or say why they could not). C2 (the page title shows an item count)
re-ran with the fix: the builder, `reviewer-ux` (at 375px phone width) and `reviewer-ui` all
started the app and used `agent-browser`, and their own notes say what they saw. Both reviewers
said they did not load the empty or single-item page in the browser and relied on the unit
tests for those, which is honest but shows the browser check is still shallow.

## Fifth pass: against Osmani agent-skills, Pocock skills and pstack

Read from clones at Osmani `1be8e34`, Pocock `49dd158`, Cursor plugins `11713c6`. Compared
with what the factory has today, not with the playbook. Effort: S under an hour, M a few
hours, L a day or more. Nothing below has been built unless marked.

### Done in this pass

Weakened-bar scan in `policy_check.py` (5 evals), excuses tables and prove-it rules in builder
and approver, approver tries to disprove before APPROVE, diagnoser lists competing hypotheses.

Also done: items 3, 4, 8 and 9 (checklists, verify-app skill, ADRs and glossary, split jobs). All twelve
gaps below are built; none of the last four has run on a real job yet.

Also done: items 2 (`lessons.py`) and 5 (`constraints.py`, ratchet in the merge gate, empty by default).

Also done: items 11 and 12 (`factory/out-of-scope.md`, read-the-source rule in planner and builder).

Also done (items 1, 6, 7, 10 below): `DEFINITION_OF_DONE.md`, proof labels in the planner,
merge-danger block in `decision.md`, measurement check in the diagnoser.

### Gaps worth closing

| # | Gap | Source | Effort | What to build |
| --- | --- | --- | --- | --- |
| 1 | No standing Definition of Done. Acceptance criteria are per job; `REVIEW.md` only guides reviewers | Osmani `definition-of-done.md` | S | `factory/DEFINITION_OF_DONE.md`, read by builder, reviewers and approver; build.md ticks it |
| 2 | Nothing learns from repeated review findings. The same CHANGES finding can recur across jobs and nothing turns it into a check | Pocock `retro`, pstack `correct`, `encode-lessons-in-structure` | M | `lessons.py` groups findings in `round-*/review-*.md` and `rework-*.md` by class, proposes a check (architecture, types, lint, test, docs last), keeps a rule-to-enforcer table |
| 3 | Reviewer-ux and reviewer-ui have never run; builder proves UI only through `agent-browser` ad hoc | pstack `create-verification-skill` | M | Have `onboarder` generate a project-local verification skill that starts the app and checks a feature map; reviewers and builder call it |
| 4 | No performance, accessibility or observability lens. Four lenses are security, ux, ui, code | Osmani `web-performance-auditor`, `performance-checklist`, `accessibility-checklist`, `observability-checklist` | M | Add checklists the existing reviewers read; a performance lens only if the app has a URL and budgets |
| 5 | Quality thresholds are not written down. Coverage, performance budgets and exception expiry live nowhere | Osmani `constraint-driven-development` | M | `policy.constraints` (coverage on changed lines, no-fall ratchet, exception owner and expiry) checked by `merge_gate.py` through `verify_commands` |
| 6 | Blast radius is asserted, not proven | pstack `blast-radius` | S | Planner and reviewers label each safety claim with how far it was checked: said, pointed at a line, walked, ran it. Unproven claims go under Risk |
| 7 | Approver and PR body carry no merge-danger view | Pocock `pr` | S | `decision.md` gets Door (one-way or two-way), Blast Radius and before/after evidence |
| 8 | Decisions die with the job. The Design section and glossary stay on a branch's audit folder, not as durable repo ADRs | Osmani `documentation-and-adrs`, Pocock `domain-modeling` | M | On merge, `merge_gate.py` copies an accepted Design section to `docs/adr/` and keeps a glossary the intent and spec writers read |
| 9 | Big work is one job. Over the size cap it escalates; there is no way to split | Pocock `to-tickets`, `implement-spec`, `wayfinder` | L | Spec-writer may emit dependent child jobs; the orchestrator runs ready ones in parallel. Pairs with the ticket connector |
| 10 | Maintain loop trusts its numbers | pstack `benchmark-checklist`, `explain-the-number` | S | Diagnoser first checks that the metric measures what the band assumes |
| 11 | Framework choices are not grounded in official docs | Osmani `source-driven-development` | S | Builder and planner cite the docs page for any framework API they rely on and the version they read |
| 12 | Out-of-scope decisions are not remembered | Pocock `triage` `.out-of-scope/` | S | Reuse `maintain/dismiss.py` records so intent-writer sees what was already rejected |

### Nice, not needed now

- Multi-model `interrogate` with lead-judgment buckets (act on, consider, noted, dismissed). The
  buckets are cheap to copy; real cross-model review needs a non-Anthropic model, which the
  gateway route does not provide.
- Session-start hook that injects a skills map (Osmani). The orchestrator already routes.
- Skill-impact evals (Osmani `evals/skill-impact.md`): measure whether a skill changes outcomes.
- Pre-commit setup (Pocock `setup-pre-commit`), `prototype`, `wizard`.
- CI/CD, shipping and launch skills, once the CI/CD gap is decided.

### Deliberately not taken

- Whole packs, `poteto-mode` routing and the 24 principles: they compete with the orchestrator
  and add context. Style principles overlap rules the builder already has (smallest change).
- Osmani `sdd-cache` hook (WebFetch cache), Cursor-specific setup, Grok model panels.
- Pocock `git-guardrails`: `policy.blocked_commands` and the hooks already do this; check the
  list covers `reset --hard`, `clean -f` and `branch -D` before dropping it.
- pstack's stance that planning skills are not needed. The factory's gates depend on `plan.md`.

### Order, and the thing above all of it

First run one real feature through every agent. Every addition above is untested until that
happens, and the last audit named it as the biggest unproven item. Then 1, 6, 7 and 10 (small,
text only), then 2 and 5, which turn the factory's own history into checks.
