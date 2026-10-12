# Context: Forgeline

Read this first when picking the project up in a new session (including a Claude Code
web session). It says what the project is, what state it is in, what is proven, and what
to do next. Detail lives in `USAGE.md` (how to use it), `README.md`, `AUDIT.md`
(evidence) and `CHANGES.md` (what was added over the base).

## Goal

Build agents on Claude that run on a Claude **subscription**, not API keys, and use them to
automate the stages of Anthropic's "AI-Native SDLC Playbook": Plan, Design, Build, Test,
Deploy, Maintain (16 plays).

- Subscription route: the Agent SDK and `claude -p` use the Claude Code login. Unset
  `ANTHROPIC_API_KEY` or the CLI bills the API instead. Anthropic's docs say third-party
  products should not offer claude.ai login.
- Secondary route: a LiteLLM gateway with Anthropic models (`ANTHROPIC_BASE_URL`,
  `ANTHROPIC_AUTH_TOKEN`), limited to 100k TPM.

## What this repo is

Forgeline: a software factory for Claude Code. One orchestrator skill
(`.claude/skills/factory/SKILL.md`), five team skills, 14 subagents, a policy file, hooks, a
merge gate, a maintain loop, a dashboard and two eval suites. It began as the zazencodes
software factory (`zazencodes-season-3/src/software-factory-claude-code`; no LICENSE at
that repo's root when copied, so keep this repository private and check with the author
before sharing) and was extended to close the gaps found by auditing it against the
playbook, then against three public skill packs (Osmani `agent-skills`, Pocock `skills`,
Cursor `pstack`, all MIT). Ideas were adopted in our own wording; nothing from those packs is
vendored except the five pinned Pocock helper skills.

Also compared against `EricTechPro/super-board` (MIT). Borrowed: merge gate, commit-bound
approval, size cap, stop and resume, pinned helper skills. Not borrowed: automatic DB
migrations, the board as state store, model routing by difficulty.

## The flow

```
idea / ticket / incident -> intent-writer -> HUMAN accepts intent      (required)
  -> spec-writer (risk, design, optional Split) -> HUMAN approves spec
  -> planner (plan.md) -> builder -> security, ux, ui, code reviewers (parallel)
  -> any CHANGES: builder resumes   -> all PASS: approver
  -> APPROVE or ESCALATE -> merge_gate.py (only way to main)
```

State lives in `factory/jobs/<job-id>/` (markdown plus `job.json`), one git worktree per job
in `<repo>-factory/<job-id>`, and a committed audit copy under `factory/audit/<job-id>/`
on the job branch. Parallel jobs = one Claude session per job. See `USAGE.md`.

## Layout

```
.claude/skills/factory/        orchestrator; five team skills beside it
.claude/agents/                14 subagents (models pinned in frontmatter: 9 opus, 5 sonnet)
.claude/hooks/factory_hooks.py frozen paths, test lock, push/deploy gate, secrets
factory/policy.json            frozen/escalate paths, blocked commands, merge_policy, adr, intent_required
factory/DEFINITION_OF_DONE.md, out-of-scope.md, constraints.json, REVIEW.md, checklists/
factory/scripts/               jobctl, merge_gate, policy_check, snapshot_audit, metrics, doctor,
                               review_branch, install_helper_skills, lessons, constraints, adr
factory/maintain/              collect, run, scan, dismiss, schedule, bands/runbooks
factory/evals/                 run_evals.py (offline), agent_evals.py (live)
factory/dashboard.html         live board over factory/jobs/
factory/templates/             intent.md, verify-app.md
```

## Status

Re-audited against the 16 plays (`AUDIT.md`): 12 covered, 2 partial, 2 gaps. Partial:
`reviewer-ux`/`reviewer-ui` have no evals; AI PR review runs on demand and never posts. Gaps,
left out on purpose: CI/CD with tiered autonomy and rollback; Jira/ServiceNow connector;
Claude on call (a hosted product).

The fifth-pass gap list (12 items from the three packs) is **all built**: Definition of Done,
lessons from repeated findings, verify-app skill, checklists, quality ratchets, proof labels,
merge-danger block, ADRs and glossary, split jobs, measurement check, read-the-source rule,
out-of-scope memory. Also a weakened-bar scan, deliverable-file wording in the reviewers, and a
dashboard that shows split jobs.

## What is proven, and what is not

Proven:
- Offline evals: 326 checks pass with no model (Python 3.12+).
- Live agent evals on Sonnet 5.5: 17 cases. The first run passed 16 (the one failure,
  `pr-reviewer`, passed 2 of 2 on re-run, so a flake). After all later prompt changes a full re-run
  passed 17 of 17.
- End to end on a fixture repo (kept outside this repo, in the session scratchpad), Sonnet:
  job 1 (input validation): intent, spec, plan, build, 4 reviews, approver, merge gate, all
  in round 1, about 9 minutes. Job 2 (add a CI workflow): ESCALATE on `.github/**`, human
  rework, review round 2, human approve, merge. That exercised escalate, rework, a second
  review round, human approval and the gate's human-approved path.
- Run A (split job, Sonnet): one big intent split into three dependent child jobs; each child
  was specced after its dependency merged and cited the earlier ADR; all merged in round 1;
  the parent closed itself; two ADRs were committed; the test-count ratchet was measured at
  every merge. Details and the defects it found are in `AUDIT.md`.
- Run B: a fault-injected job (missing validation, a skipped test, a `# noqa`, a misleading build
  log) got CHANGES from security and code review, the weakened-bar scan flagged it, a fresh builder
  fixed it, round 2 passed and it merged. A natural job (B1) passed in round 1.
- Run C (UI jobs; `agent-browser` 0.39.0 on the author's Mac, using the existing Chrome): the
  onboarder drafted an accurate `verify-app` skill; the builder used it; the UX and UI reviewers at
  first did not open the page (no Skill tool, an escape hatch in the prompt); fixed, and on a
  second UI job both opened it in the browser and said what they saw.
- The dashboard was checked live in a browser against real job data.

Not proven (built and covered by offline evals only):
- A CHANGES round on a defect the builder produced by itself: it was shown only with fault
  injection (a hand-planted bug and weakened bar, caught by the reviewers; see `AUDIT.md`).
- `lessons.py` on real review data (only two jobs exist).
- Managed settings and cron were tested against files, not installed. Collectors are tested
  against local fixtures, not a real service.

Real defects the end-to-end runs found and fixed: `reviewer-code` once returned PASS without
writing its file (reviewers and approver now say the output file is the deliverable); the merge
gate left `__pycache__` that made the next merge see a dirty tree (now in `.gitignore.factory`);
`reviewer-ux` skipped its file on a clean PASS (reviewers now write on every outcome, and the
orchestrator re-spawns once); non-blocking review notes are not carried into the next slice
(open); the UX and UI reviewers did not open the page (fixed); a hook rule blocked read-only
`git merge-tree` (fixed).

## Key decisions

- Intent is required (`policy.intent_required`); only a person's `--skip-intent "reason"`
  waives it, and the approver escalates a waiver. Split children inherit the parent's intent.
- Hooks are the hard stops, not prompts. They hold in auto mode. They are advisory to anyone
  with repo access until an admin runs `factory/managed/install.py`.
- Agents never merge, push or deploy. `merge_gate.py` is the only route to main.
- Model output is mechanically checked where it matters: scan findings and review comments
  must cite a real file, line and quoted text, or they are dropped.
- The baseline for a ratchet is read from the base checkout, never the branch.
- Worktree agents run `cd <worktree> && git ...`, which Claude Code always asks about, so live
  agent evals and unattended runs use `--permission-mode auto`.
- Prompts are plain and narrow. An edit that told reviewers to "override" another rule was
  blocked by the permission classifier; the narrower wording was used instead.

## Known gaps and cautions

- The two upstream example jobs (they named the upstream author's machine and website) were
  removed from the working tree and `factory/jobs/` is now ignored; the first commit will not
  contain them. The offline check count fell from 344 to 326 because the checks that validated
  those example files have nothing left to read.
- The upstream repo has no licence: keep this repository private.
- The evals and `maintain/scan.py` need Python 3.12+; the system Python 3.9 fails with a
  SyntaxError in `scan.py`.
- `/factory stop` cannot kill a running subagent; it pauses the next stage.
- The Claude subscription session limit applies to unattended runs; work pauses until the reset
  and resumes from the files with `/factory resume`.
- Helper skills are third-party instructions your agents follow. Read before installing.
- `verify_commands` is empty by default, so the gate prints `NO VERIFY`.
- A weaker model (Haiku) is only a lower bound on prompt behaviour.
- Open design points found by the runs: non-blocking review notes are not carried into the next
  slice or a follow-up item (a person has to act on the orchestrator's report); an accepted
  `intent.md` still starts with `INTENT: DRAFT` (the approver notices and treats it as accepted);
  the UX and UI browser checks are shallow (they skip states they cannot reach from the sample data).

## Next steps

1. **Before pushing:** decide whether the name Forgeline stays (it appears only in docs and the dashboard title; the
   `/factory` command and `factory/` folder are functional names).
2. Finish proving the unproven list: a job that gets a CHANGES round and a weakened-bar hit,
   run twice so `lessons.py` has repeats; a UI job with `verify-app` and `agent-browser`; the
   rest of the split job (children 2 and 3, the parent closing, the ADR). Fixtures: a tiny
   Python library repo with `AGENTS.md`, tests, the factory copied in, `verify_commands` set.
   Drive it with `claude -p '/factory ...' --permission-mode auto` from the fixture directory.
3. Run `python3 factory/evals/agent_evals.py` after any prompt change.
4. In a real repo: copy `.claude/` and `factory/`, run `/factory doctor`, install helper skills,
   set `merge_policy.verify_commands`, edit `policy.json` for your deploy paths, run one real
   feature through the whole flow.
5. Enable collectors that point at your service, then `schedule.py --install`.
6. Optional: evals for `reviewer-ux` and `reviewer-ui`; Sentry and PostHog collectors; an admin
   deploying `managed/install.py`; CI/CD with rollback; a ticket connector.
