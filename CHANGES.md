# Changes from the upstream factory

Upstream: `zazencodes-season-3/src/software-factory-claude-code`. At the time of
copying, the repository had no LICENSE file at its root, so check with the
author before sharing this beyond your own use.

Gaps were taken from an audit against Anthropic's "The AI-Native SDLC Playbook".

## Added

| Playbook gap | Addition |
| --- | --- |
| Plan: capture intent (required) | `policy.intent_required`, enforced in `jobctl.py`; waiver needs a person's reason and is escalated; `intent-writer` agent, `factory/templates/intent.md`, `/factory intent`, `/factory accept` |
| Design: human decides to build | Spec approval gate, `/factory approve-spec`, `/factory respec`, `spec.md` gets `Risk:` and `Ticket:` lines |
| Build: plan before code | `planner` agent and `plan.md`; builder reports Plan adherence; code reviewer and approver check the diff against the plan |
| Build: hooks as guardrails | `.claude/hooks/factory_hooks.py`: frozen paths, bug-fix test lock |
| Test: failing test first | Builder's bug-fix flow with `.factory-test-lock` |
| Deploy: separate duties and review guide | `factory/REVIEW.md` read by every reviewer |
| Deploy: approval gates | Push, deploy and publish gate (needs a person-set environment variable); secrets-in-commit gate |
| Deploy: deterministic policy | `factory/policy.json` and `policy_check.py` used by the approver |
| Governance: audit trail | `snapshot_audit.py` commits job artifacts to the branch under `factory/audit/` |
| Governance: human decisions on record | `spec-approval.md` and `human-approval.md` |
| Metrics | Timestamped `history` in `job.json`, `metrics.py`, `/factory metrics` |
| Test: evals gate config changes | `factory/evals/run_evals.py` (288 checks, needs Python 3.12+) and a CI workflow |
| Test: agent behaviour | `factory/evals/agent_evals.py`: 17 live cases covering 12 of 14 agents |
| Design: decision record | Spec `## Design` section (alternatives, consequences, interfaces), read by planner and approver |
| Build: CLAUDE.md | `scripts/doctor.py`, `/factory doctor`, `onboarder` agent and `/factory init` |
| Build: skills | Five team skills in `.claude/skills/` |
| Build: auto mode | `install.py --default-mode auto`; hooks verified in auto mode |
| Build: quality bar cannot be lowered quietly | `policy_check.py` flags added suppressions, skipped or deleted tests and stripped assertions (`weakened bar`); the approver escalates them. Idea from Osmani `constraint-driven-development` and pstack `encode-lessons-in-structure` |
| Build/Deploy: excuses and proof | Builder and approver carry a short excuses-to-rules table, builder must observe the real artifact, approver tries to disprove before APPROVE, diagnoser lists competing hypotheses. Ideas from Osmani anti-rationalization tables and `doubt-driven-development`, pstack `prove-it-works`; nothing third-party was installed |
| Deploy: PR review loop | `scripts/review_branch.py`, `pr-reviewer` agent, `/factory review` |
| Maintain: real metrics | `maintain/collect.py` and `collectors.json`; `maintain/schedule.py` writes the cron block |
| Deploy: merge control | `scripts/merge_gate.py`: lock, commit-bound approval, policy re-check, size cap, verification on the current base; hook blocks hand merges |
| Governance: pause and resume | `jobctl.py pause/resume/active`, `/factory stop`, `/factory resume` |
| Build: helper skills | `scripts/install_helper_skills.py` and `skills/helper-skills.json` (pinned, MIT); builder, planner and reviewers use them |
| Maintain: more scans | `scanner-quality` agent; deterministic `secrets` and `dependencies` lenses (`scan_lenses.py`) |
| Build: hard enforcement | `factory/managed/install.py`: hooks, policy and permission rules as managed settings |
| Maintain: monitoring | `factory/maintain/`: sigma-band detector, cooldowns, `diagnoser` agent, runbooks gated by `pre_approved` and a person-set variable |
| Maintain: incidents re-enter as intent | `run.py --open-intents` writes `incident.md` and calls `/factory intent`; dismissals widen bands |
| Maintain: recurring security scans | `scanner-security` agent and `scan.py`: mechanical validation, recurring tracking, triage to backlog |
| Legacy system of record | `--ticket`, commit prefix, optional ticketing connector settings in `policy.json` |

## Changed

- `SKILL.md` rewritten for the new stages. The orchestrator now changes job state
  only through `jobctl.py`.
- Dashboard shows nine stages and the new files.
- The approver also escalates every spec rated `Risk: high`.

## Not built

- CI/CD integration with tiered autonomy, scoped deploy tools and a rehearsed
  rollback (left out on purpose), and anything that needs it, such as triggering a
  review when a pull request opens.
- A ticket connector (Jira or ServiceNow). Only settings and key handling.
- Hosted products: Claude Tag on-call, Claude Code Review, Claude Security.
- Evals for `reviewer-ux` and `reviewer-ui` (they need the `agent-browser` CLI).

See `AUDIT.md` for the play-by-play assessment.

## Verification

`run_evals.py` passes 283 checks without a model; breaking a rule makes the matching
checks fail. `agent_evals.py` passes against the real CLI. The maintain loop, all
four scan lenses, the branch reviewer and the builder were also run live.
