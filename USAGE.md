# Forgeline: usage guide

Everything the tool does and how to run it. For the short version read `README.md`;
for the state of the project and what to do next, `CONTEXT.md`.

## 1. What it is

Forgeline turns a feature request into a reviewed, tested, merged change using Claude
Code, with people deciding at the points that matter. It is plain files you copy into a
repository: one orchestrator skill, fourteen subagents, a policy file, hooks, scripts, a
dashboard and evals. There is no server and no database; state is markdown and JSON in
the repo.

```
idea / ticket / incident → intent-writer → HUMAN accepts the intent
  → spec-writer → HUMAN approves the spec        (a big spec may Split into child jobs)
  → planner → builder → security, ux, ui, code reviewers (in parallel)
  → any CHANGES: the builder is resumed         → all PASS: approver
  → APPROVE → merge gate → main        or        ESCALATE → a person decides
```

Agents never merge, push or deploy. `merge_gate.py` is the only way to `main`.

The interactive map (`diagrams/forgeline-map.html`, see `diagrams/README.md`) shows how every part fits and
where each command, agent, file and guard sits; open it first if you are new.

## 2. What you need

- Claude Code, logged in. Forgeline runs on your Claude **subscription**; unset
  `ANTHROPIC_API_KEY` or the CLI bills the API instead. A LiteLLM gateway with Anthropic
  models also works (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`), subject to its limits.
  Anthropic's terms say third-party products should not offer claude.ai login.
- `git` and `python3` (the hooks use it). Python **3.12 or newer** to run the evals and
  `maintain/scan.py`; the hooks and the other scripts run on older versions.
- `agent-browser` (https://github.com/vercel-labs/agent-browser) if the project has pages
  to look at. The builder and the UX and UI reviewers use it with your installed Chrome.
- A project doc (`AGENTS.md` or `CLAUDE.md`) in the target repo saying how to set up a
  fresh checkout, run tests, build and lint, start the dev server (with a port), where
  things live, and what not to touch. The agents carry nothing repo-specific.

## 3. Install it in a repository

1. Copy `.claude/` and `factory/` to the repo root. Start with an empty `factory/jobs/` and
   an empty `factory/backlog.md`.
2. Add the lines in `.gitignore.factory` to your `.gitignore` (`/factory/jobs/`, the test
   lock, `__pycache__/`). Without `__pycache__/` ignored, the merge gate sees a dirty tree.
3. `python3 factory/scripts/doctor.py` (or `/factory doctor`). Fix every FAIL.
   `/factory init` drafts a missing `AGENTS.md`; read it and fix each `UNKNOWN:` line.
4. Edit `factory/policy.json` for your repo (section 8): deploy and CI paths under
   `escalate_paths`, secrets and anything agents must not touch under `frozen_paths`,
   your layout under `test_globs`, and **`merge_policy.verify_commands`** (your build and
   test commands). Left empty, the gate prints `NO VERIFY`.
5. `python3 factory/scripts/install_helper_skills.py --apply` installs five MIT skills
   (tdd, diagnosing-bugs, codebase-design, code-review, grilling) pinned to one commit.
   Read them first: they become instructions your agents follow.
6. If the app has a UI: install `agent-browser`, run `/factory init`, read
   `VERIFY.proposed.md`, fix its `UNKNOWN:` lines and move it to
   `.claude/skills/verify-app/SKILL.md`. Doctor warns until it exists.
7. `python3 factory/evals/run_evals.py` must pass.
8. Commit everything on `main`. Then `/factory intent <idea>`.

Windows: change the two hook commands in `.claude/settings.json` from `python3` to
`python`.

## 4. Running a job

Start Claude Code in the repo (not in a worktree) and use these commands.

| Step | You type | What happens |
| --- | --- | --- |
| 1 | `/factory intent <idea, ticket or incident>` | `intent.md` is written in your own words, with guesses marked and open questions listed. |
| 2 | `/factory accept <job-id>` (answer the open questions) | A git worktree is created and the spec-writer writes `spec.md`. |
| 3 | `/factory approve-spec <job-id>` or `/factory respec <job-id> <note>` | You read the spec. Approval starts the plan; a note sends it back. |
| 4 | (automatic) | Plan, build, four reviews in parallel, builder resumed on any CHANGES (at most `max_resumes` times), then the approver. |
| 5 | (automatic) | APPROVE goes to the merge gate. ESCALATE stops at *needs-human*. |
| 6 | `/factory approve <job-id>` or `/factory rework <job-id> <note>` | For a needs-human job: merge it as is, or send it back to the builder. |

Shortcuts and variants:

- `/factory <feature>` runs a job directly. Intent is required by default
  (`policy.intent_required`), so it starts at intent. Only you can waive that, with
  `--skip-intent "reason"`; the approver always escalates a waived intent.
- `--type bugfix` makes the builder write a failing test first and lock the tests.
- `--ticket ABC-123` prefixes commits with the key. With a ticket server configured under
  `policy.ticketing.mcp_server`, the job reads the ticket and comments the outcome.
- `/factory next` builds the first unchecked item in `factory/backlog.md`.
- `/factory stop` pauses unfinished jobs at the next stage; `/factory resume [<job-id>]`
  continues them from their files. A subagent already running can only be stopped by
  interrupting the session.

Each job's record is `factory/jobs/<job-id>/`: `intent.md`, `spec.md`, `plan.md`,
`build.md`, `round-N/review-*.md`, `decision.md`, your approvals, and `job.json` (stage,
round, review verdicts, history). Each agent writes exactly one file. The orchestrator
changes state only through `jobctl.py`.

## 5. Parallel jobs and git worktrees

Every job gets its own branch `factory/<job-id>` and its own git worktree at
`<repo>-factory/<job-id>` (a sibling of your repo). Agents change code only there, so your
checkout can be dirty or on another branch, and jobs never touch each other.

To run jobs in parallel, open one Claude Code session per job in the same repo and start
`/factory` in each. A session orchestrates only the job it started. Job numbers are
claimed with a plain `mkdir`, so two sessions cannot take the same one. Each job gets its
own ports and `agent-browser` sessions: with job number `n`, the builder uses `5100+10n`,
`reviewer-ux` `5101+10n` and `reviewer-ui` `5102+10n`.

Inside one job the four reviewers run in parallel and the orchestrator waits for all
four before it decides. The worktree is removed by the merge gate after a merge. A
needs-human job keeps its worktree so you can inspect it.

Only the merge touches your main checkout. The gate takes a lock, so two jobs cannot merge
at once; it exits `6` if another merge holds it, and you run it again.

## 6. Models and cost

Each agent pins a model in its frontmatter: `opus` for the planner, spec-writer, builder,
approver, security reviewer, diagnoser, scanners and pr-reviewer; `sonnet` for the
intent-writer, onboarder, and the code, UX and UI reviewers. Edit the `model:` line in
`.claude/agents/<name>.md` to change one.

To force every subagent onto one model for a run, set `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`
(or `haiku`) in the environment and pass `--model` to `claude`; the live agent evals and
the end-to-end runs in `AUDIT.md` were run this way on Sonnet. A weaker model is a lower
bound on how the prompts behave, not a proof they hold on the pinned models.

Usage counts against your subscription limits. A small job takes about 10 minutes and a
handful of agent calls; the live agent evals take about 15. If you hit the session limit,
work pauses until it resets and resumes from the files (`/factory resume`).

## 7. The dashboard

```bash
cd factory && python3 -m http.server
```

Open http://localhost:8000/dashboard.html. It polls `jobs/` every two seconds, so it shows
a running job live. No build step, no dependencies.

- **Columns** are stages: Intent, Spec, Approve spec, Plan, Build, Review, Approve,
  Merged, Needs human. A tenth, **Split**, appears when a big spec was split into children.
- **Cards** show the job, its feature (clamped), branch and the review chips per round
  (`sec ux ui code`, green PASS, amber CHANGES, dashed pending). A pulsing dot means an
  agent is working.
- A pink **your call** flag marks a job waiting on you, with the exact command to run:
  `approve-spec` / `respec` at spec approval, `approve` / `rework` at needs-human.
- Tags show `paused`, `intent waived`, `part of 003`, `waits on 004` and
  `1/3 slices merged` for split work.
- **Click a card** to read its markdown files (intent, spec, plan, build, each review,
  decision), colour-coded by their first line.
- An unknown stage shows as a banner at the top.

## 8. Policy: `factory/policy.json`

Agents cannot edit it, and neither `factory/scripts/`, `templates/`, `checklists/`,
`REVIEW.md`, `DEFINITION_OF_DONE.md`, `out-of-scope.md` nor `constraints.json`.

| Key | Meaning |
| --- | --- |
| `intent_required` | A spec job needs an accepted intent (default true). |
| `spec_approval` | `human` always pauses after the spec; `auto` skips the pause only for `Risk: low` and never for a split. |
| `max_resumes` | Builder resumes after round 1 (a run has at most this plus one review rounds). |
| `frozen_paths` | Agents may never edit these; a hook refuses and the gate always refuses. |
| `escalate_paths` | Editable, but a human must approve the merge (CI, deploy, migrations, infra). |
| `dependency_files` | A change here needs a human. |
| `test_globs` | What counts as a test (bugfix lock, weakened-bar scan). |
| `blocked_commands` | Push, deploy, publish and similar, blocked unless you start Claude Code yourself with `FACTORY_RELEASE_AUTHORIZED=1`. |
| `ticketing` | Ticket key pattern and optional MCP server. |
| `merge_policy.auto_max_lines` | A change over this needs a human even after APPROVE (default 400). |
| `merge_policy.verify_commands`, `require_verify` | Run on the merged result before the real merge; `require_verify` refuses if none are set. |
| `merge_policy.constraints` | Ratchets (section 11). Empty by default. |
| `adr.dir` | Where merged Design sections are recorded (default `docs/adr`; empty turns it off). |

## 9. The guardrails

- **Hooks** (`.claude/hooks/factory_hooks.py`): refuse edits to frozen paths, refuse test
  edits during a bug fix, refuse push, deploy and publish, refuse commits containing
  secrets, refuse `git merge` of a factory branch. They hold in auto mode. Path rules apply
  only inside factory worktrees, so you are never blocked in your own checkout.
- **Managed settings**: until an admin runs `python3 factory/managed/install.py --apply`
  the hooks are advisory to anyone with repo access. Also protect `.claude/` and
  `factory/policy.json` with CODEOWNERS and branch protection.
- **Weakened-bar scan** (`policy_check.py`): flags added suppressions (`@ts-ignore`,
  `eslint-disable`, `noqa`), skipped or deleted tests and removed assertions; the approver
  escalates any hit.
- **Merge gate** (`merge_gate.py <job-id>`, exit codes `0` merged, `3` human must decide,
  `4` refused, `5` verification or ratchet failed, `6` lock held, `7` merge failed): checks
  the decision, that the branch still matches the commit that was reviewed, the policy,
  intent, dependencies of split jobs, then merges into a throwaway copy of the base and runs
  `verify_commands` and the ratchets before the real merge. It never pushes.
- **Audit**: after each stage the job folder is committed to the job branch under
  `factory/audit/<job-id>/`, so the whole record merges with the change.

## 10. Reviews, checklists and the standing bar

Four reviewers run on every job: security, ux, ui, code. They follow `factory/REVIEW.md`
(Important blocks, a Nit goes under Notes) and the checklist for their pass in
`factory/checklists/`: `security.md`, `accessibility.md` (ux and ui), `performance.md`,
`observability.md` and `testing.md` (code). The builder ticks
`factory/DEFINITION_OF_DONE.md` in `build.md`; the code reviewer and approver check the
ticks. The approver tries to disprove its decision before writing APPROVE and ends
`decision.md` with a Door (one-way or two-way), Blast radius and Evidence block.

## 11. Quality ratchets, ADRs and the glossary

- **Ratchets**: add `{"name": "coverage", "command": "...", "pattern": "TOTAL.*?(\\d+)%",
  "direction": "min", "tolerance": 0.5}` under `merge_policy.constraints`, and put the
  baseline in `factory/constraints.json` (`{"baselines": {"coverage": 82}, "exceptions": []}`).
  The gate measures the merged result and refuses a drop below the baseline. The baseline is
  read from the base checkout, so a branch cannot lower it. An exception needs an owner, a
  reason and an expiry within a year. A person raises a baseline by editing the file.
- **ADRs**: after a merge, a spec's real Design section is committed as
  `docs/adr/NNNN-slug.md`. Intent-writer, spec-writer and planner read `docs/GLOSSARY.md`
  (write one) and the ADRs.
- **Out of scope**: `factory/out-of-scope.md` lists decisions not to build something; the
  intent-writer and spec-writer read it.

## 12. Big work: split jobs

A spec-writer that sees work too big for one reviewable change adds a `## Split` section
listing 2 to 6 slices, each with `Depends:`. After you approve the spec, the orchestrator
creates a child job per slice. Children inherit the accepted intent (no waiver), do not
get a worktree or spec yet, and the parent moves to *split* and builds nothing.
`/factory ready` starts the children whose dependencies have merged: each is specced
against the code as it then is, goes through the normal gates, and the gate refuses a child
whose dependencies have not merged. The parent closes when every child has merged. Run
`/factory ready` again after each child merges.

## 13. Everything else

- `/factory metrics`: cycle time, first-pass rate, review rounds, spec-rework and
  escalation rates.
- `/factory lessons`: groups review findings that recurred across jobs and suggests a fix
  for each, strongest first (architecture, types, lint, test, rule). You decide; nothing is
  changed for you.
- `/factory review <branch | --pr N>`: a read-only agent reviews any branch or pull request.
  A script drops any comment whose file, line or quoted code is not in the diff. Nothing is
  posted; for a PR it writes `gh-review.sh` for you to run.
- `/factory doctor`, `/factory init`: readiness check and `AGENTS.md` drafting.
- **Maintain loop** (`/factory maintain ...`): `collect` gathers metrics (a command, an
  HTTP JSON endpoint, a log's error rate, git, the factory itself); `run` tests them against
  their own baselines (1, 2 and 3 sigma), has the diagnoser explain a breach and turns a
  serious one into an intent that waits for you; `scan` runs four lenses (security, quality,
  secrets, dependencies) with every finding checked against the repo; `triage` accepts a
  finding into the backlog or dismisses it with a reason; `schedule --install` writes the
  cron block. Point `factory/maintain/collectors.json` at your service. It never merges,
  deploys or pushes.
- **Team skills** in `.claude/skills/`: dependency-upgrade, write-runbook, release-notes,
  fix-flaky-test, incident-postmortem. Add your own the same way.

## 14. Verifying the factory itself

```bash
python3 factory/evals/run_evals.py      # 326 offline checks, no model; needs Python 3.12+
python3 factory/evals/agent_evals.py    # 17 live agent cases; about 15 minutes of subscription use
```

CI (`.github/workflows/factory-evals.yml`) runs the offline evals on any change to
`.claude/`, `factory/`, `AGENTS.md` or `CLAUDE.md`. Model output varies, so one live-eval
failure is a prompt to look, not proof of a regression; re-run that case once.

## 15. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Gate refuses: main checkout not clean | `__pycache__/` or a stray file; ignore it or commit it. |
| Gate prints `NO VERIFY` | `merge_policy.verify_commands` is empty. |
| A job is stuck at *review* | A reviewer returned without writing its file; the orchestrator holds the round open. Re-run that reviewer. |
| An agent says a hook blocked it | By design. It writes `BLOCKED`; the job goes to needs-human. Never work around a hook. |
| Everything bills the API | `ANTHROPIC_API_KEY` is set; unset it. |
| `scan.py` or the evals show a SyntaxError | Python older than 3.12. |
| Claude says the session limit was reached | Wait for the reset, then `/factory resume`. |

## 16. Limits

- End-to-end runs (see `AUDIT.md`) covered natural jobs, an escalation with a human rework, a
  split job through to its last child, UI jobs, and a CHANGES round on a fault-injected defect.
  Not yet shown: a CHANGES round on a defect the builder makes unprompted, and `lessons.py` on
  repeats across real jobs.
- `/factory stop` cannot kill a running subagent.
- The push gate matches command text; it cannot catch every way to run a push.
- The secrets scan covers common key formats and complements a real scanner.
- Not built, on purpose: CI/CD with tiered autonomy and rollback, and a Jira or ServiceNow
  connector. Hosted products (Claude Tag on-call, Claude Code Review) are not files you can
  add here.
