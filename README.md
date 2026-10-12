# Forgeline

A software factory for Claude Code. It takes an idea through intent, spec, plan, build,
review and a merge gate, with people deciding at the points that matter and hooks, a policy
file and a dashboard keeping it honest. One orchestrator skill, five team skills, fourteen
subagents, scripts, evals and plain markdown; it runs on a Claude subscription.

- **Using it:** `USAGE.md` covers install, every command, parallel jobs and git worktrees,
  models, the dashboard, policy and the guardrails.
- **Project state and next steps:** `CONTEXT.md`.
- **What was added over the base, and what is missing:** `CHANGES.md` and `AUDIT.md`.

## Quick start

```bash
# in the repo you want the factory to work on
cp -R <forgeline>/.claude <forgeline>/factory .          # then delete factory/jobs/* examples
cat <forgeline>/.gitignore.factory >> .gitignore
python3 factory/scripts/doctor.py                         # fix every FAIL (or /factory init)
python3 factory/scripts/install_helper_skills.py --apply  # optional, read them first
python3 factory/evals/run_evals.py                        # needs Python 3.12+
claude                                                    # then: /factory intent <your idea>
cd factory && python3 -m http.server                      # dashboard at localhost:8000/dashboard.html
```

Set `merge_policy.verify_commands` in `factory/policy.json` to your build and test commands
before the first merge. Details are in `USAGE.md`.

```
idea/ticket/incident → intent-writer → HUMAN accepts intent      (required)
feature ─────────────────────────────┐
                                     ▼
                     spec-writer → HUMAN approves spec
                                     ▼
                                  planner → plan.md
                                     ▼
                  builder → [security, ux, ui, code] → WAIT FOR ALL
                     ▲                                      │
                     └──── any CHANGES: resume builder ◄────┤
                                                            ▼ all PASS
                       merge to main ◄─ APPROVE ─ approver ─ ESCALATE → needs-human
```

This folder is laid out like a repo root, so you can copy it into yours.

```
.claude/
  skills/factory/SKILL.md      the orchestrator
  agents/                      intent-writer, spec-writer, planner, builder,
                               reviewer-{security,ux,ui,code}, approver,
                               onboarder, pr-reviewer, diagnoser, scanner-security,
                               scanner-quality
  hooks/factory_hooks.py       enforcement: frozen paths, test lock, push gate, secrets
  settings.json                wires the hooks
factory/
  policy.json                  the rules (frozen/escalate paths, blocked commands, autonomy)
  REVIEW.md                    what reviewers flag and what they skip
  templates/                   intent.md and verify-app.md
  DEFINITION_OF_DONE.md        the standing bar the builder ticks and reviewers check
  out-of-scope.md              decisions not to build something (people edit)
  constraints.json             ratchet baselines and exceptions (people edit)
  checklists/                  security, accessibility, performance, observability, testing
  scripts/                     jobctl, merge_gate, policy_check, snapshot_audit, metrics, doctor,
                               review_branch, install_helper_skills, lessons, constraints, adr
  evals/run_evals.py           deterministic evals (config, hooks, managed, maintain, scan)
  evals/agent_evals.py         runs the agents on fixture repos and checks their output
  maintain/                    detect, run, dismiss, scan, collect_factory, bands, runbooks
  managed/install.py           installs the hooks as managed settings (admin step)
  backlog.md  dashboard.html   queue and visual board
  jobs/                        runtime state, one folder per job (gitignored)
  activity/                    shared activity log written by hooks (gitignored)
  audit/                       committed copy of each job's record (made on the job branch)
.github/workflows/factory-evals.yml   runs the evals on any change to the factory
.gitignore.factory             lines to add to your .gitignore
```

## Commands

```
/factory <feature> [--ticket KEY] [--type bugfix]   run a new job
/factory intent <idea|ticket|incident> [--ticket KEY]   write intent.md and stop
/factory accept <job-id>                            accept the intent, start the spec
/factory approve-spec <job-id>                      approve the spec, start planning
/factory respec <job-id> <note>                     send the spec back with feedback
/factory next                                       run the first unchecked backlog item
/factory approve <job-id>                           merge a needs-human job into main
/factory rework <job-id> <note>                     send a needs-human job back to the builder
/factory metrics                                    cycle time, first-pass rate, escalations
/factory stop | resume [<job-id>]                  pause unfinished jobs, pick them up again
/factory doctor                                     check the repo is ready (AGENTS.md, policy, hooks)
/factory lessons                                    group repeated review findings and suggest a check for each
/factory ready                                      start split children whose dependencies have merged
/factory init                                       draft AGENTS.md for a new repo
/factory review <branch | --pr N>                   review any branch or pull request
/factory maintain collect|schedule|run|scan|triage  metrics, cron, bands, scans, triage
```

## What each addition does

- **Intent** (`intent-writer`), required by default (`policy.intent_required`; `jobctl.py` refuses a spec job without one, and only a person's `--skip-intent "reason"` waives it, which the approver always escalates): captures an idea, ticket or incident in the
  originator's own words, separates guesses from facts, and lists open questions.
  A human accepts it before any spec exists.
- **Spec approval gate**: the factory stops after the spec until a person runs
  `/factory approve-spec`. `policy.spec_approval = "auto"` skips the pause only
  for specs the writer rated `Risk: low`.
- **Plan** (`planner`): `plan.md` lists the ordered steps, the test that proves
  each acceptance criterion, the blast radius, and the rollback. The builder
  follows it; the code reviewer and approver check the diff against it.
- **Audit trail**: `snapshot_audit.py` commits each job's artifacts onto its
  branch under `factory/audit/<job-id>/`, so the whole record merges into `main`
  with the change.
- **Hooks**: deterministic, not advisory. They refuse edits to frozen paths,
  refuse test edits during a bug fix (failing test first, then a lock), refuse
  `git push`, deploys and publishes unless a person authorizes, and refuse
  commits containing secrets.
- **Policy check**: the approver runs `policy_check.py`, which matches the diff
  against `policy.json` instead of judging path rules by eye.
- **REVIEW.md**: one place that sets what is Important and what is a Nit.
- **Metrics and evals**: stage timings and rates come from `job.json`; the evals
  prove the hooks and scripts still behave after every change.
- **Ticket link**: `--ticket KEY` is recorded, prefixed on commits, and (when
  `policy.ticketing.mcp_server` names a connector) read at the start and
  commented on at the end.

- **Standing bar and proof**: `DEFINITION_OF_DONE.md` is ticked in `build.md`; the planner
  labels how far each safety claim was checked; the approver tries to disprove its own
  decision and writes a Door, Blast radius and Evidence block; `policy_check.py` flags
  suppressions, skipped or deleted tests and stripped assertions.
- **Checklists**: `factory/checklists/` gives each reviewer a short list for its pass.
- **Verification skill**: `onboarder` drafts `VERIFY.proposed.md` (how to start the app and a
  feature map); once a person installs it as `.claude/skills/verify-app/`, the builder and
  the UX and UI reviewers use it.
- **Ratchets**: `merge_policy.constraints` and `factory/constraints.json` make the merge gate
  refuse a measured number (coverage, test count) that falls below a person-set baseline.
- **Decisions that last**: a merged spec's Design section becomes `docs/adr/NNNN-slug.md`;
  intent-writer, spec-writer and planner read `docs/GLOSSARY.md` and the ADRs; 
  `out-of-scope.md` remembers what was decided against.
- **Split jobs**: a spec too big for one change splits into dependent child jobs
  (`/factory ready`); the gate refuses a child whose dependencies have not merged.
- **Learning**: `/factory lessons` groups review findings that recur across jobs and suggests
  a lint, type, test or rule for each.

## Use it in your repo

1. Copy `.claude/`, `factory/` and `.github/workflows/factory-evals.yml` into your
   repo root. Start with an empty `factory/jobs/` and an empty backlog.
2. Add the lines in `.gitignore.factory` to your `.gitignore`.
3. Make sure `AGENTS.md` (or `CLAUDE.md`) says how to set up a fresh checkout,
   start the dev server on a given port, and run tests, build and lint. The
   agents carry nothing repo-specific.
4. Edit `factory/policy.json` for your repo: your deploy and CI paths under
   `escalate_paths`, anything agents must never touch under `frozen_paths`, your
   test layout under `test_globs`.
5. Run `python3 factory/evals/run_evals.py`. It must pass before you start.
6. Install the [`agent-browser`](https://github.com/vercel-labs/agent-browser)
   CLI if your project has pages to look at (builder and UX/UI reviewers).
7. Commit everything on `main`, then run `/factory <feature>`.

The hooks call `python3`. On Windows, change the two commands in
`.claude/settings.json` to `python`.

To authorize a push or deploy, start Claude Code yourself with
`FACTORY_RELEASE_AUTHORIZED=1`. An agent cannot set it for the hook.

## Dashboard

```bash
cd factory && python3 -m http.server
```

Open <http://localhost:8000/dashboard.html>. Jobs move across nine stages (a tenth,
Split, appears when a big spec was split into child jobs, which show what they wait on);
a spec waiting for approval or a job needing you stands out, with the command to run. Click a card to read
its markdown files. It polls every two seconds.

## Maintain loop

```bash
python3 factory/maintain/schedule.py --install    # cron: hourly collect+run, weekly scans, weekly evals
# or by hand:
python3 factory/maintain/collect.py                          # real metrics into factory/maintain/metrics/
python3 factory/maintain/run.py --diagnose --open-intents    # detect, diagnose, incident -> intent
python3 factory/maintain/scan.py run --lens all              # security, quality, secrets, dependencies
```

`collectors.json` says where metrics come from: a command that prints a number, an
HTTP JSON endpoint (secrets read from environment variables), a log file's error
rate, git (commits or reverts per day), or the factory's own cycle time. Enable and
edit the entries for your service. Detection is plain statistics, so it is
repeatable; the model only diagnoses and writes. A breach becomes an incident, then
an intent that waits for a human. Dismissals need a reason and widen that metric's
band. The secrets and dependency lenses need no model.

## Reviewing any branch or pull request

```bash
python3 factory/scripts/review_branch.py --base main --head my-branch
python3 factory/scripts/review_branch.py --pr 42      # needs a remote called origin
```

A read-only agent reviews the diff against `factory/REVIEW.md`. A script then drops
any comment whose file, line or quoted code is not in the diff, so an invented
comment cannot reach a pull request. Nothing is posted: for a pull request it writes
`gh-review.sh`, which you run after reading `review.md`.

## The merge gate

`factory/scripts/merge_gate.py <job-id>` is the only way a job reaches main (a hook
blocks `git merge` of a factory branch). Inside one lock it checks the decision, that
the branch still matches the commit the reviewers and approver saw (a later code commit
voids the approval), the policy (a frozen-path edit is always refused; escalate paths,
dependency files, a change over `merge_policy.auto_max_lines`, or a waived intent need a
human even if the approver said APPROVE), then merges into a throwaway copy of the base
as it is now and runs `merge_policy.verify_commands` there before the real merge. Set
`verify_commands` to your build and test commands; with it empty the gate says
`NO VERIFY`, and `require_verify: true` refuses outright.

## Helper skills

`python3 factory/scripts/install_helper_skills.py --apply` installs five MIT-licensed
skills (tdd, diagnosing-bugs, codebase-design, code-review, grilling) from Matt
Pocock's public repo, pinned to one commit in `factory/skills/helper-skills.json`. The
builder, planner and reviewers use them when present and work without them. Read them
before installing: they become instructions your agents follow.

## Permission mode

Interactive sessions can run in auto mode, where Claude Code's classifier approves
routine actions. The hooks and deny rules still stop a push, a deploy, a secret or an
edit to a protected path (checked live: `git push` was blocked in auto mode).
`python3 factory/managed/install.py --default-mode auto` sets it for everyone.

## Team skills

`.claude/skills/` holds procedures the agents and your team reuse:
`dependency-upgrade`, `write-runbook`, `release-notes`, `fix-flaky-test`,
`incident-postmortem`. Add your own the same way.

## Evals

```bash
python3 factory/evals/run_evals.py      # 326 deterministic checks, no model, run on every change
python3 factory/evals/agent_evals.py    # 17 live agent cases, uses your Claude login
```

## Hard enforcement

The hooks in `.claude/settings.json` can be edited by anyone with write access.
For rules that must not be bypassed, an admin runs
`python3 factory/managed/install.py` (dry run by default; `--apply` to write).
It installs the hooks and policy in the system managed-settings directory and
turns on `allowManagedHooksOnly`. Also protect `.claude/` and
`factory/policy.json` with CODEOWNERS and branch protection.

## Limits to know about

- Until managed settings are deployed, the hooks are advisory for a person with
  repo access. The path rules apply only inside factory worktrees.
- The push gate matches command text, so it can block a command that mentions
  `git push` and cannot catch every way to run one.
- The secrets scan covers common key formats; it complements a real scanner.
- Agent evals run a handful of cases, and model output varies, so a single
  failure is a prompt to look, not proof of a regression.
- Deliberately not built: CI/CD integration with tiered autonomy and rollback, and
  a ticket connector (Jira or ServiceNow). Only the settings exist. Hosted
  products (Claude Tag on-call, Claude Code Review, Claude Security) are not files
  you can add here.

## Origin

Forgeline started from the software factory in
[zazencodes-season-3](https://github.com/zazencodes/zazencodes-season-3/tree/main/src/software-factory-claude-code),
which had no licence file when it was copied, so keep this repository private and check
with its author before sharing it further. `CHANGES.md` lists everything added since.
`BUILD_PROMPT.md` is the prompt that built that original, kept for reference.
