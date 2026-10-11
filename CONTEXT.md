# Context: Software Factory Plus

Read this first when picking the project up in a new session. It says what the
project is, why it exists, what state it is in, and what to do next. The detail
lives in `README.md`, `AUDIT.md` and `CHANGES.md`.

## Goal

Build agents on Claude that run on a Claude **subscription**, not API keys, and
use them to automate the stages of Anthropic's "AI-Native SDLC Playbook":
Plan, Design, Build, Test, Deploy, Maintain (16 plays).

- Subscription route: the Agent SDK and `claude -p` use the Claude Code login.
  Unset `ANTHROPIC_API_KEY` or the CLI bills the API instead. Anthropic's docs
  say third-party products should not offer claude.ai login.
- Secondary route: a LiteLLM gateway with Anthropic models (`ANTHROPIC_BASE_URL`,
  `ANTHROPIC_AUTH_TOKEN`), limited to 100k TPM.

## What this repo is

The zazencodes software factory for Claude Code
(`zazencodes-season-3/src/software-factory-claude-code`, no LICENSE at the repo
root when copied, so keep it private) extended to cover the playbook gaps found in
an audit. One orchestrator skill (`.claude/skills/factory/SKILL.md`), 14 subagents,
a policy file, hooks, a merge gate, a maintain loop, and two eval suites.

Also compared against `EricTechPro/super-board` (MIT): a GitHub-Project-board
pipeline. Borrowed from it: merge gate, commit-bound approval, size cap, stop and
resume, pinned helper skills. Not borrowed: automatic DB migrations, the board as
state store, model routing by difficulty.

## The flow

```
idea / ticket / incident -> intent-writer -> HUMAN accepts intent      (required)
  -> spec-writer (risk, design section) -> HUMAN approves spec
  -> planner (plan.md) -> builder -> security, ux, ui, code reviewers (parallel)
  -> any CHANGES: builder resumes   -> all PASS: approver
  -> APPROVE or ESCALATE -> merge_gate.py (only way to main)
```

State lives in `factory/jobs/<job-id>/` (markdown plus `job.json`), one git
worktree per job in `<repo>-factory/<job-id>`, and a committed audit copy under
`factory/audit/<job-id>/` on the job branch.

## Layout

```
.claude/skills/factory/        orchestrator; five team skills beside it
.claude/agents/                intent-writer, spec-writer, planner, builder,
                               reviewer-{security,ux,ui,code}, approver, onboarder,
                               pr-reviewer, diagnoser, scanner-{security,quality}
.claude/hooks/factory_hooks.py frozen paths, test lock, push/deploy gate, secrets
factory/policy.json            frozen/escalate paths, blocked commands, merge_policy,
                               intent_required, ticketing
factory/scripts/               jobctl, merge_gate, policy_check, snapshot_audit,
                               metrics, doctor, review_branch, install_helper_skills
factory/maintain/              collect, run (detect+diagnose+incident->intent), scan
                               (4 lenses), dismiss, schedule (cron), bands/runbooks
factory/managed/install.py     hooks as managed settings (admin step)
factory/evals/                 run_evals.py (offline), agent_evals.py (live)
factory/skills/                helper-skills.json (pinned MIT skills)
```

## Commands

`/factory <feature>` · `intent` · `accept` · `approve-spec` · `respec` · `next` ·
`approve` · `rework` · `metrics` · `doctor` · `init` · `review <branch|--pr N>` ·
`stop` · `resume` · `maintain collect|schedule|run|scan|triage`

## Status

Re-audited against the 16 plays (see `AUDIT.md`): **12 covered, 2 partial, 2 gaps**.

- Partial: continuous evals (no tests for `reviewer-ux` / `reviewer-ui`, which need
  the `agent-browser` CLI); AI PR review (runs on demand, never posts, no trigger
  when a PR opens, which needs CI).
- Gaps, left out on purpose: CI/CD with tiered autonomy and rollback; Jira / ServiceNow
  connector. Gap that is a hosted product: Claude on call (Claude Tag).

Verification: `python3 factory/evals/run_evals.py` passes 288 checks (Python 3.12+; the system 3.9 fails in scan.py) with no model
(mutation-tested). `python3 factory/evals/agent_evals.py` passes 17 live cases against
the real CLI (about 15 minutes, uses the subscription). The maintain loop, all four scan
lenses, the branch reviewer, the builder with helper skills, and auto mode with hooks
were also run live on a fixture repo.

## Key decisions

- Intent is required (`policy.intent_required`); only a person's `--skip-intent
  "reason"` waives it, and the approver escalates a waiver.
- Hooks are the hard stops, not prompts. They also hold in auto mode (checked live).
  They are advisory to anyone with repo access until an admin runs
  `factory/managed/install.py`.
- Agents never merge, push or deploy. `merge_gate.py` is the only route to main and
  a hook blocks `git merge` of a factory branch.
- Model output is mechanically checked where it matters: scan findings and review
  comments must cite a real file, line and quoted text, or they are dropped.
- Worktree agents run `cd <worktree> && git ...`, which Claude Code always asks
  about, so live agent evals run in `auto` permission mode.

## Known gaps and cautions

- No full feature has gone through every agent in one `/factory` run; each agent and
  hand-off was run separately.
- The merge gate has been tested on real git repos in the evals, not on a job from the
  full flow. `verify_commands` is empty by default, so it prints `NO VERIFY`.
- `/factory stop` cannot kill a running subagent; it pauses the next stage.
- Managed settings and the cron block were tested against files, not installed.
- Collectors are tested against local fixtures; you must point `collectors.json` at
  your service.
- Helper skills are third-party instructions your agents follow. Read them before
  installing (`install_helper_skills.py --apply`; npm is blocked in the sandbox, so it
  uses git at a pinned commit).
- The upstream repo has no licence: keep this private.

## Next steps

1. **GitHub:** create an empty private repo and give the owner/name; then add the
   remote and push (nothing has been pushed; `gh` auth was invalid in the sandbox).
   The local repo is on `main` with the work committed.
2. In your real repo: copy `.claude/` and `factory/`, run `/factory doctor`, install
   helper skills, set `merge_policy.verify_commands`, edit `policy.json` for your deploy
   paths.
3. Run one real feature through the whole flow to prove it end to end.
4. Enable the collectors that point at your service, then `schedule.py --install`.
5. Optional: tests for `reviewer-ux` / `reviewer-ui`; Sentry and PostHog collectors;
   an admin deploying `managed/install.py`.
