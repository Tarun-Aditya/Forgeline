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
| Test: evals gate config changes | `factory/evals/run_evals.py` (326 checks, needs Python 3.12+) and a CI workflow |
| Test: agent behaviour | `factory/evals/agent_evals.py`: 17 live cases covering 12 of 14 agents |
| Design: decision record | Spec `## Design` section (alternatives, consequences, interfaces), read by planner and approver |
| Build: CLAUDE.md | `scripts/doctor.py`, `/factory doctor`, `onboarder` agent and `/factory init` |
| Build: skills | Five team skills in `.claude/skills/` |
| Build: auto mode | `install.py --default-mode auto`; hooks verified in auto mode |
| Demo and teaching | `web-studio/demo/record-sample.mjs`, `run-sample-demo.sh`, `drive-job.py`, `walkthrough/` (Monaco code view of the real diffs), `videos/forgeline-sample-demo.mp4`, and the `record-demo` skill; web app `agentEnv()` stops leaking `NODE_ENV` to the agents |
| Build: quality bar cannot be lowered quietly | `policy_check.py` flags added suppressions, skipped or deleted tests and stripped assertions (`weakened bar`); the approver escalates them. Idea from Osmani `constraint-driven-development` and pstack `encode-lessons-in-structure` |
| Build/Deploy: excuses and proof | Builder and approver carry a short excuses-to-rules table, builder must observe the real artifact, approver tries to disprove before APPROVE, diagnoser lists competing hypotheses. Ideas from Osmani anti-rationalization tables and `doubt-driven-development`, pstack `prove-it-works`; nothing third-party was installed |
| Standing bar, proof, merge danger | `factory/DEFINITION_OF_DONE.md` ticked in build.md and checked by reviewer-code and approver; planner labels each safety claim by how far it was checked; approver adds Door, Blast radius and Evidence; diagnoser checks the metric itself first |
| Review file always written | Reviewers and approver state that their output file is the assigned deliverable (found when `reviewer-code` skipped it in an end-to-end run) |
| Decisions not to build are remembered; framework APIs are checked | `factory/out-of-scope.md` read by intent-writer and spec-writer; planner and builder read the pinned library source before relying on an API |
| Test: repeated mistakes become checks | `scripts/lessons.py` and `/factory lessons`: groups recurring CHANGES findings across jobs, suggests architecture, types, lint, test or rule, strongest first |
| Test: written quality bar | `merge_policy.constraints` and `factory/constraints.json`: the gate measures a number on the merged result and refuses a drop below a person-set baseline; exceptions need an owner and an expiry within a year; the baseline is read from the base checkout so a branch cannot lower it |
| Review: perf, accessibility, observability, testing, security | `factory/checklists/` (own wording), read by the reviewer whose pass it belongs to; a line that does not apply is skipped |
| Test: UI reviewers can actually run the app | `factory/templates/verify-app.md`, `onboarder` drafts `VERIFY.proposed.md`, a person moves it to `.claude/skills/verify-app/`; builder and ux/ui reviewers call it when listed; `doctor` warns when an app with a dev server has none |
| Design: decisions outlive the job | `adr.py` called by the merge gate: a spec's real Design section is committed as `docs/adr/NNNN-slug.md` after the merge (`policy.adr.dir`, empty turns it off); intent-writer, spec-writer and planner read `docs/GLOSSARY.md` and the ADRs |
| Build: big work is split | A spec may carry a `## Split` section; `/factory approve-spec` then creates child jobs that inherit the intent and wait on their dependencies (`jobctl.py create --parent --intent-from --depends`, `jobctl.py ready`, `/factory ready`); the merge gate refuses a child whose dependencies have not merged |
| Review: files always written, pages always opened | Reviewers write their file on every outcome and the orchestrator re-spawns a reviewer that returns without it once; reviewer-ux and reviewer-ui have the Skill tool, read `verify-app` and must open the page when the diff changes what it renders; the blocked-command rule for `git merge` no longer matches `merge-tree` or `merge-base` (found by end-to-end runs) |
| Docs: how it all fits | `diagrams/forgeline-map.html`, an interactive drill-down map of the system, rendered with the MIT `/visual` skill from EricTechPro/super-board (see `diagrams/THIRD_PARTY_NOTICES.md`) |
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
