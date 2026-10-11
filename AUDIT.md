# Audit against the AI-Native SDLC Playbook (fourth pass: after comparing with super-board)

Scored on what was built and run. "Run" means exercised for real: the offline
evals (288 checks), the live agent evals (17 cases against the real
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
| 10 | Test | Continuous evals | Partial | 17 live agent cases cover 12 of the 14 agents, plus 288 offline checks. Not covered: `reviewer-ux` and `reviewer-ui`, which need the `agent-browser` CLI. The weekly run is scheduled by `schedule.py`; it was tested against a crontab file, not installed (no cron here). |
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

- No complete feature has run through every agent in one go.
- The merge gate has been tested against real git repos in the evals but has not merged a job produced by the full `/factory` flow.
- `/factory stop` cannot kill a subagent that is already running; it pauses the next stage.
- `reviewer-ux` and `reviewer-ui` have never run (no `agent-browser`).
- Managed settings and cron were tested against files, not installed on a machine.
- The HTTP and log collectors are tested against local fixtures, not your service.
- Agent evals depend on model output; two fixture mistakes of mine were found by
  agents being right, so expect the occasional flaky result.
