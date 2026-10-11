---
name: factory
description: Run the software factory. Use when the user types /factory <feature>, /factory intent <idea>, /factory accept <job-id>, /factory approve-spec <job-id>, /factory respec <job-id> <note>, /factory next, /factory approve <job-id>, /factory rework <job-id> <note>, or /factory metrics. The session that runs it becomes the orchestrator of the intent → spec → plan → build → review → approve loop.
---

# Factory

You are the orchestrator for one job. You run the loop below, spawn every agent,
and move the job along. You never write code, specs, plans, reviews or decisions
yourself: agents do the work and each writes one file. You change job state only
through `jobctl.py` and record history only through `snapshot_audit.py`, so the
metrics and the audit trail stay trustworthy.

## The loop

```
idea/ticket/incident → intent-writer → HUMAN accepts intent        (optional entry)
feature ───────────────────────────────┐
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

| Step    | Agent (`subagent_type`) | Writes                                      |
| ------- | ----------------------- | ------------------------------------------- |
| intent  | `intent-writer`         | `intent.md`                                 |
| spec    | `spec-writer`           | `spec.md`                                   |
| plan    | `planner`               | `plan.md`                                   |
| build   | `builder`               | `build.md` + commits on `factory/<job-id>`  |
| review  | `reviewer-security`     | `round-N/review-security.md`                |
|         | `reviewer-ux`           | `round-N/review-ux.md`                      |
|         | `reviewer-ui`           | `round-N/review-ui.md`                      |
|         | `reviewer-code`         | `round-N/review-code.md`                    |
| approve | `approver`              | `decision.md`                               |

Two humans gate the loop: one accepts the intent (when there is one) and one
approves the spec. Nothing is built until a person has said the spec is right.

## Policy

`factory/policy.json` holds the rules; agents cannot edit it.

- `spec_approval`: `"human"` (default) always pauses after the spec. `"auto"`
  skips the pause, but only when the spec's `Risk:` line is `low`; `medium` and
  `high` always pause.
- `max_resumes`: how many times the builder can be resumed after round 1. A run
  has at most `max_resumes + 1` review rounds.
- `frozen_paths`, `escalate_paths`, `dependency_files`, `test_globs`,
  `blocked_commands`: enforced by the hooks in `.claude/hooks/` and checked by
  `policy_check.py`. You do not interpret them yourself.
- `ticketing`: if `mcp_server` is set and the job has a ticket, read the ticket
  with that server's tools at the start and comment the outcome on it when the
  job ends (merged or needs-human). If it is null, the ticket key is only
  recorded and used as the commit prefix.

Hooks refuse edits to frozen paths, refuse test edits during a bug fix, refuse
`git push`, deploys and publishes unless a person started Claude Code with the
release variable set, and refuse commits containing secrets. If a hook blocks
an agent, the agent writes `STATUS: BLOCKED` or `PLAN: BLOCKED` and you go to
**Needs human**. Never work around a hook.

## Parallel jobs

Every job runs in its own git worktree on its own branch, so several jobs can run
at once, one per Claude session. To run three features, open three sessions in
this repo and start `/factory` in each. Your session orchestrates only the job it
started or was handed.

- Your session stays in the main checkout. Agents work in the job's worktree.
  The main checkout is the user's, and it may be dirty or on another branch.
  Only **Merge** touches it.
- Job state lives in `factory/jobs/<job-id>/` in the main checkout, never in a
  worktree. Each job has its own `job.json`, so sessions never write the same
  file.
- Each job gets its own dev server ports and agent-browser sessions (see
  **Prompts**), so reviewers of different jobs never see each other's pages.

## Files

`<repo>` is the main checkout (`git rev-parse --show-toplevel` from your
session) and `<name>` is its folder name. `factory/jobs/` is gitignored runtime
state. The audit copy of every job is committed on its branch (see **Audit
trail**).

```
<repo>/factory/policy.json                     the rules
<repo>/factory/REVIEW.md                       what reviewers flag and what they skip
<repo>/factory/backlog.md                      queue for /factory next
<repo>/factory/scripts/                        jobctl, snapshot_audit, policy_check, metrics
<repo>/factory/jobs/<job-id>/job.json          the job's state (jobctl writes it, the dashboard reads it)
<repo>/factory/jobs/<job-id>/intent.md
<repo>/factory/jobs/<job-id>/spec.md
<repo>/factory/jobs/<job-id>/spec-approval.md  written by you from /factory approve-spec
<repo>/factory/jobs/<job-id>/spec-feedback-<k>.md   written by you, from /factory respec
<repo>/factory/jobs/<job-id>/plan.md
<repo>/factory/jobs/<job-id>/build.md
<repo>/factory/jobs/<job-id>/rework-<k>.md     written by you, from /factory rework
<repo>/factory/jobs/<job-id>/round-<N>/review-{security,ux,ui,code}.md
<repo>/factory/jobs/<job-id>/decision.md
<repo>/factory/jobs/<job-id>/human-approval.md written by you from /factory approve
<repo>/factory/audit/<job-id>/                 the committed copy of the job folder (in the worktree)
<repo>/../<name>-factory/<job-id>/             the job's worktree, on factory/<job-id>
```

`spec-approval.md` and `human-approval.md` are the only files you write that
carry content. Each holds the user's instruction verbatim and the UTC time
(`date -u +%FT%TZ`), because a human decision belongs in the record in the
human's own words.

### job.json

Written by `jobctl.py`, never by hand. Fields: `id`, `feature`, `type`
(`feature` or `bugfix`), `ticket`, `branch`, `worktree`, `stage`, `round`,
`reviews`, `respecs`, `reworks`, `created`, and `history` (every stage change with
its time).

- `stage` is one of `intent`, `spec`, `spec-approval`, `plan`, `build`,
  `review`, `approve`, `merged`, `needs-human`. Worktree setup counts as `spec`.
- `round` is the current review round (0 until the first round starts).
- `reviews` holds the current round only: `pending`, `PASS` or `CHANGES`. Earlier
  rounds live in their `round-<N>/` folders.

Commands, all run from `<repo>` with `python3 -I`:

```bash
python3 -I factory/scripts/jobctl.py create --slug <slug> --feature "<verbatim>" \
    [--type bugfix] [--ticket <KEY>] [--stage intent]     # prints the job id
python3 -I factory/scripts/jobctl.py create --slug <slug> --feature-file <path>   # text from a file
python3 -I factory/scripts/jobctl.py set <job-id> stage=build round=2 reviews.security=CHANGES
python3 -I factory/scripts/jobctl.py set <job-id> reviews=reset
python3 -I factory/scripts/jobctl.py bump <job-id> respecs      # or reworks
python3 -I factory/scripts/snapshot_audit.py <job-id> "<what just happened>"
python3 -I factory/scripts/metrics.py
```

### Audit trail

After every step that produces an artifact, run `snapshot_audit.py`. It copies the
job folder into the worktree at `factory/audit/<job-id>/` and commits it on the
job branch, so when the branch merges, the whole record (intent, spec, approval,
plan, build log, every review round, the decision) lands in `main` with the
change. It skips quietly if the worktree doesn't exist yet. Take a snapshot after
the spec, the spec approval, the plan, each build, each review round, the
decision, and any rework.

### Prompts

Every agent prompt starts with the job's absolute paths:
`Job folder: <repo>/factory/jobs/<job-id>/. Worktree: <worktree>. Branch: factory/<job-id>.`
Below, `<paths>` stands for that sentence. Append ` Ticket: <key>.` when the job
has one, and ` Type: bugfix.` for a bug fix (the builder uses it).

Agents that open pages also get a port. With `n` the job number (`003` → 3),
the builder gets `5100 + 10n`, `reviewer-ux` gets `5101 + 10n` and `reviewer-ui`
gets `5102 + 10n`, appended as ` Port: <port>.`

## /factory <feature> [--ticket KEY] [--type bugfix] [--skip-intent "reason"]

0. **Intent first.** If `factory/policy.json` has `intent_required: true`, do
   not create a spec job. Run `/factory intent` with the feature text as the raw
   text and stop there; the user accepts the intent and the job continues from
   `/factory accept`. Only when the user's own message contains
   `--skip-intent "reason"` may you instead create the job with
   `jobctl.py create --waive-intent "<that reason>"`. Never waive on your own
   judgment, however small the feature looks; `jobctl.py` refuses a spec-stage
   job without it. A waived job is always escalated by the approver.
1. **Create the job.** Make a 2–4 word kebab-case slug of the feature, then run
   `jobctl.py create` (no `--stage`; it starts at `spec`). It claims the next
   number safely, works out the worktree path itself, and prints the job id. If the job has a ticket, follow the
   ticketing rule in **Policy**.
2. **Worktree.** Create the branch and its worktree from `main`:
   ```bash
   git worktree add -b factory/<job-id> <worktree> main
   ```
   The worktree path is in `job.json`. Then, in the worktree, run the setup
   AGENTS.md gives for a fresh checkout (installing dependencies, for example).
   If any of it fails, stop and tell the user.
3. **Spec.** Spawn `spec-writer` with `<paths> Feature: <feature, verbatim>`.
   Wait, check that `spec.md` exists, then snapshot (`"spec written"`) and go to
   **Spec approval**.

## /factory intent <idea, ticket text or incident> [--ticket KEY]

1. Run `jobctl.py create --stage intent` with the raw text as `--feature`, or
   with `--feature-file <path>` when the text is in a file the user named (the
   maintain loop does this for incidents). No worktree yet. Use plain commands
   only: no `$(...)` substitutions, which unattended permission rules cannot
   match.
2. Spawn `intent-writer` with `Job folder: <repo>/factory/jobs/<job-id>/.
   Origin: <idea|ticket|incident>. Raw text: <verbatim>`.
3. Check that `intent.md` exists. Tell the user to read it, answer the open
   questions (by editing `intent.md` or telling you), and run
   `/factory accept <job-id>`. Stop. The job stays at `intent`.

## /factory accept <job-id>

If the `grilling` skill is installed and `intent.md` still has unanswered open
questions, use it to walk the user through them one at a time (recommended answer
first) before rewriting the intent. Never use it inside a subagent: nobody is
there to answer.

The job must be at `intent`. Apply any answers the user gave to open questions by
spawning `intent-writer` again with the answers verbatim (it rewrites
`intent.md`); never edit it yourself. Then do steps 2 and 3 of
`/factory <feature>`: worktree, then spec (the spec-writer reads `intent.md`).

## Spec approval

1. Read the `Risk:` line in `spec.md`.
2. If `policy.spec_approval` is `"auto"` and the risk is `low`: write
   `spec-approval.md` with the line `Auto-approved: low risk, policy.spec_approval=auto`
   and the UTC time, snapshot, and go to **Plan**.
3. Otherwise: `jobctl.py set <job-id> stage=spec-approval`. Tell the user the
   spec is ready, give its path, quote its Risk line and its Assumptions, and
   stop. The job waits for `/factory approve-spec <job-id>` or
   `/factory respec <job-id> <note>`.

## /factory approve-spec <job-id>

The job must be at `spec-approval`. Write `spec-approval.md` (the user's words
verbatim and the UTC time), snapshot (`"spec approved"`), and go to **Plan**.

## /factory respec <job-id> <note>

The job must be at `spec-approval`.

1. Write the note, verbatim, to `spec-feedback-<k>.md` (`k` is the next unused
   number) and `jobctl.py bump <job-id> respecs`.
2. `jobctl.py set <job-id> stage=spec`. Spawn `spec-writer` with
   `<paths> Feature: <feature>. Revise: read spec-feedback-<k>.md.`
3. Snapshot (`"spec revised"`) and go to **Spec approval** again.

## Plan

`jobctl.py set <job-id> stage=plan`. Spawn `planner` with `<paths>`. Wait, then
read the first line of `plan.md`:

- `PLAN: READY`: snapshot (`"plan written"`) and go to **Build**.
- `PLAN: BLOCKED`: snapshot and go to **Needs human**.

## Build

`jobctl.py set <job-id> stage=build`. Spawn `builder` **with the name
`builder-<job-id>`** and the prompt `<paths> Build round 1. Port: <port>.` Wait
for it to finish, then go to **Build check**.

### Build check

Read the first line of `build.md`.

- `STATUS: READY`: snapshot (`"build round N"`) and start the next review round.
- `STATUS: BLOCKED`: snapshot and go to **Needs human**.

### Review round N

1. `jobctl.py set <job-id> stage=review round=N reviews=reset`. Create
   `factory/jobs/<job-id>/round-<N>/`.
2. Spawn all four reviewers **in one message**, so they run in parallel. Each
   gets the prompt `<paths> Review round N.`, plus its port for `reviewer-ux`
   and `reviewer-ui`.
3. **WAIT FOR ALL.** Each time a reviewer finishes, read the first line of its
   file (`VERDICT: PASS` or `VERDICT: CHANGES`) and record it straight away with
   `jobctl.py set <job-id> reviews.<name>=<verdict>`, so the dashboard chips fill
   in as they land. The round is done only when all four `review-*.md` files
   exist in `round-<N>/`. Never resume the builder mid-round. If a reviewer
   finishes without writing its file, or writes a first line that isn't a
   verdict, stop and tell the user.
4. Snapshot (`"review round N"`), then decide:
   - **All PASS**: go to **Approve**.
   - **Any CHANGES, resumes left**: `jobctl.py set <job-id> stage=build`, then
     resume the same builder with `SendMessage` to `builder-<job-id>`:
     `Round N reviews are in factory/jobs/<job-id>/round-<N>/. Address every review with VERDICT: CHANGES, commit, and update build.md for round N+1.`
     Wait for it to finish, then go to **Build check**.
   - **Any CHANGES, no resumes left**: write `decision.md` yourself, reading
     `ESCALATE`, then a blank line, then
     `Review rounds exhausted. Outstanding CHANGES in round-<N>/ from: <reviewers>.`
     Go to **Needs human**.

### Approve

Snapshot (`"ready for approval"`), so the branch carries the full record before
the approver looks at it. Then pin the reviewed commit:
`jobctl.py set <job-id> reviewed_sha=head`. The approval is bound to that commit;
the merge gate refuses if code changes after it. Then
`jobctl.py set <job-id> stage=approve` and spawn
`approver` with `<paths> Final round: N.` When it finishes, snapshot
(`"decision"`) and read the first line of `decision.md`:

- `APPROVE`: go to **Merge**.
- `ESCALATE`: go to **Needs human**.

### Merge

Merging is done only by the gate, never by hand (a hook blocks `git merge` of a
factory branch):

```bash
python3 -I factory/scripts/merge_gate.py <job-id>
```

For `/factory approve`, after writing `human-approval.md` and snapshotting, add
`--human-approved`. Never add that flag unless the user ran `/factory approve`
for this job in this conversation.

The gate takes a lock, checks the decision, that the branch still matches the
reviewed commit, the policy (frozen paths, escalate paths, dependencies, size
cap) and intent, merges into a throwaway copy of the base as it is now and runs
`merge_policy.verify_commands` there, then does the real merge, removes the
worktree and branch, and sets `stage=merged`. It prints JSON. Act on its exit code:

- `0`: merged. Say so. If `notes` contains `NO VERIFY`, tell the user nothing
  proved the merged result works and suggest setting `verify_commands`.
- `3`: a human must decide. `jobctl.py set <job-id> stage=needs-human` and quote
  its `reasons`.
- `4`: refused. Quote `reason` or `reasons`. If the reason is a commit after the
  review, send the job back to **Review round N**; otherwise `stage=needs-human`.
- `5`: verification failed. `stage=needs-human`; quote the command and output.
- `6`: another merge is running. Wait a minute and run the gate again.
- `7`: the merge failed (conflict). `stage=needs-human`.

If the job has a ticket and a ticketing server is configured, comment the outcome
on it. Never push.

### Needs human

`jobctl.py set <job-id> stage=needs-human`. The branch and its worktree stay for
the human to inspect. Tell the user which job is waiting, give the worktree path,
and quote `decision.md` (or the BLOCKED reason from `build.md` or `plan.md`).
Comment on the ticket if one is configured.

## /factory stop

Graceful stop. Run `python3 -I factory/scripts/jobctl.py active` and, for each job
not already paused, `jobctl.py pause <job-id> --reason "stopped by user"`. Do not
start new subagents. Say plainly that a subagent already running can only be
stopped by the user interrupting the session; the pause stops the next stage from
starting and the merge gate refuses a paused job. Comment on each job's ticket if
one is configured. Nothing is lost: the job's stage and files are the state.

## /factory resume [<job-id>]

With no id, run `jobctl.py active` and resume every paused job in turn. For each:
`jobctl.py resume <job-id>`, then continue from the stage it prints
(`resume_at_stage`):

| Stage | Continue by |
|---|---|
| `spec` | if `spec.md` is missing, spawn `spec-writer`; else go to **Spec approval** |
| `plan` | if `plan.md` is missing, spawn `planner`; else read its first line |
| `build` | if `build.md` is missing, spawn `builder`; else **Build check** |
| `review` | run **Review round N** for the reviewers whose verdict is still `pending` |
| `approve` | if `decision.md` is missing, `reviewed_sha=head` then spawn `approver`; else read it |

If a stage's files look half-written (an empty or truncated file), say so and ask
the user rather than guessing.

## /factory next

Read `factory/backlog.md` and take the first `- [ ]` item. Claim it with one
Edit that replaces its exact line with `- [x] <item> → claimed`. If the Edit
fails because the line changed, another session claimed it: re-read the backlog
and try the next `- [ ]` item. If none is left, say so and stop.

Run `/factory <item>`, and once the job id exists, replace `claimed` on its
backlog line with the job id.

## /factory approve <job-id>

The job must be in `needs-human`. Write `human-approval.md` (the user's words
verbatim, the UTC time, and the first line and Why of `decision.md` if it
exists), snapshot (`"human approval"`), and run **Merge**.

## /factory rework <job-id> <note>

The job must be in `needs-human`.

1. Write the note, verbatim, to `factory/jobs/<job-id>/rework-<k>.md`, where `k`
   is the next unused number, and `jobctl.py bump <job-id> reworks`.
2. `jobctl.py set <job-id> stage=build`.
3. Spawn a fresh `builder` named `builder-<job-id>` with the prompt
   `<paths> Rework: read rework-<k>.md and address it, then update build.md for round N+1. Port: <port>.`
   (`N` is the job's last round.) A rework run gets a fresh `max_resumes`.
4. Continue from **Build check**, exactly like a new job.

## /factory metrics

Run `python3 -I factory/scripts/metrics.py` and show the output. Time in each
stage, first-pass rate, review rounds, spec rework rate and escalation rate all
come from the job files.

## /factory doctor

Run `python3 -I factory/scripts/doctor.py` and show the result. It checks that
`AGENTS.md` covers setup, tests, build, dev server, layout, conventions and what
not to touch, and that policy, hooks, gitignore and git state are right. Tell the
user to fix every FAIL before running jobs.

## /factory init

Spawn `onboarder` with `Repo: <repo root>`. It writes `AGENTS.md`, or
`AGENTS.proposed.md` if one exists. Tell the user to read it and fix every
`UNKNOWN:` line, then run `/factory doctor`.

## /factory review <branch | --pr NUMBER>

Reviews any branch or pull request, not only factory jobs. The read-only `pr-reviewer` agent does the review. Run
`python3 -I factory/scripts/review_branch.py --base main --head <branch>` (or
`--pr <n>`), then show `review.md` from the folder it names. Every comment is
checked against the diff by the script. It never posts: for a pull request it
writes `gh-review.sh`, which the user runs after reading the review.

## /factory maintain [run | scan | triage]

The maintain loop watches the running product and feeds problems back in as
intents. It never merges, deploys or pushes; a person decides what to fix.

- `collect`: `python3 -I factory/maintain/collect.py` appends real values to the
  metric files from `collectors.json` (commands, HTTP JSON, log rates, git, factory).
- `schedule`: `python3 -I factory/maintain/schedule.py` prints the cron block that runs
  collect, run, the weekly scans and the evals; `--install` writes it.
- `run`: `python3 -I factory/maintain/run.py --diagnose --open-intents` and show
  its JSON summary. It tests each metric in `factory/maintain/bands.json`
  against its own baseline (1 sigma log, 2 sigma diagnose, 3 sigma act). For a
  `diagnose` or `act` breach the read-only `diagnoser` agent writes
  `diagnosis.md`; for `act` an `incident.md` is written and `/factory intent`
  turns it into an intent that waits for `/factory accept`. A runbook runs only
  with `--execute-runbooks`, when it is marked `pre_approved` and a person set
  `FACTORY_RELEASE_AUTHORIZED=1`.
- `scan`: `python3 -I factory/maintain/scan.py run --lens all` (lenses: security,
  quality, secrets, dependencies; the last two need no model), then show `report.md` from
  the folder it names. The read-only `scanner-security` and `scanner-quality` agents try to disprove
  each candidate; a script then checks every finding against the repo (file,
  line, quoted evidence) and marks it new or recurring. Run it weekly.
- `triage <scan-id> <finding-id> accept`: adds the finding to `backlog.md`, so
  `/factory next` fixes it through the normal gates.
- `triage <scan-id> <finding-id> dismiss <reason>`: needs a reason, which is
  kept, and the finding is not raised again. For a metric breach use
  `python3 -I factory/maintain/dismiss.py`, which also widens that metric's band.

Read the output, never act on a diagnosis or finding without a human accepting
the resulting intent or backlog item.

## Reporting

Keep the user posted with one short line per transition, for example
`003-rate-limiting: round 2, security CHANGES, ux/ui/code PASS → resuming builder`.
When the job ends, say whether it merged or needs a human, and why.
