#!/usr/bin/env python3
"""Writes diagrams/forgeline-map.json, the data for the interactive Forgeline map.

  python3 diagrams/src/build_map.py            # writes diagrams/forgeline-map.json
  python3 <super-board>/skills/visual/scripts/visual.py render --map diagrams/forgeline-map.json \
          --out diagrams/forgeline-map.html --no-open

The page itself is rendered by the /visual skill from EricTechPro/super-board (MIT), see
diagrams/THIRD_PARTY_NOTICES.md. This file only holds Forgeline's content, in that tool's map schema:
nodes (shared), views (each shows a subset of nodes with its own edges).
Standard library only. Keep facts in step with USAGE.md and .claude/skills/factory/SKILL.md.
"""
import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "forgeline-map.json"

NODES = {}
VIEWS = []


def n(id, label, kind, what, when, how, source=None, sub=None, opens=None, verbs=None, **extra):
    assert id not in NODES, f"duplicate node {id}"
    d = {"id": id, "label": label, "kind": kind, "what": what, "when": when, "how": how}
    if source:
        d["source"] = source
    if sub:
        d["sublabel"] = sub
    if opens:
        d["opensView"] = opens
    if verbs:
        d["verbs"] = verbs
    d.update(extra)
    NODES[id] = d


def view(id, parent, title, caption, ids, edges, **extra):
    v = {"id": id, "parent": parent, "title": title, "caption": caption, "nodeIds": ids,
         "edges": [{"from": a, "to": b, "label": lab} if lab else {"from": a, "to": b} for a, b, lab in edges]}
    v.update(extra)
    VIEWS.append(v)


# ---------------------------------------------------------------- commands (public)
n("factory", "/factory", "public", "The orchestrator skill. One command runs the whole loop for one job and never writes code itself.",
  "You type /factory <feature>, or a sub-command such as intent, accept or approve-spec.",
  "The session spawns each agent, reads the first line of its output file, and changes job state only through jobctl.py and snapshot_audit.py. It pauses at two human gates.",
  ".claude/skills/factory/SKILL.md", sub="orchestrator skill", opens="root", verbs=["intent", "accept", "approve-spec", "approve", "rework"])
n("cmd-intent", "/factory intent", "public", "Writes intent.md from a raw idea, ticket or incident, then stops.",
  "You have an idea. /factory <feature> does the same, because intent is required by default.",
  "Creates the job at stage intent and spawns the intent-writer. Only a person's --skip-intent \"reason\" skips it; the approver then always escalates.",
  ".claude/skills/factory/SKILL.md", sub="idea → intent.md")
n("cmd-accept", "/factory accept", "public", "Accepts the intent and starts the spec.",
  "You have read intent.md and answered its open questions.",
  "Rewrites the intent with your answers, creates the branch and worktree, then spawns the spec-writer.", ".claude/skills/factory/SKILL.md", sub="<job-id>")
n("cmd-approve-spec", "/factory approve-spec", "public", "Approves the spec and starts planning.",
  "You have read spec.md and its Risk and Assumptions.",
  "Writes your words and the time to spec-approval.md. A spec with a Split section goes to the split step instead of the planner.", ".claude/skills/factory/SKILL.md", sub="<job-id>")
n("cmd-respec", "/factory respec", "public", "Sends the spec back with a note.", "The spec is not right yet.",
  "Saves your note verbatim as spec-feedback-N.md and re-spawns the spec-writer.", ".claude/skills/factory/SKILL.md", sub="<job-id> <note>")
n("cmd-approve", "/factory approve", "public", "Merges a needs-human job.", "The approver escalated and you decided it is fine.",
  "Writes human-approval.md and runs the merge gate with the human-approved flag. Never used without this command.", ".claude/skills/factory/SKILL.md", sub="<job-id>")
n("cmd-rework", "/factory rework", "public", "Sends a needs-human job back to the builder.", "You want a change before it merges.",
  "Saves your note as rework-N.md and starts a fresh builder with a fresh resume budget.", ".claude/skills/factory/SKILL.md", sub="<job-id> <note>")
n("cmd-ready", "/factory ready", "public", "Starts split children whose dependencies have merged.", "A split parent exists, or a child just merged.",
  "Runs jobctl ready --close-parents, creates a worktree and spec for each ready child, and closes a parent whose children all merged.", ".claude/skills/factory/SKILL.md")
n("cmd-next", "/factory next", "public", "Runs the first unchecked backlog item.", "You want the next queued job.",
  "Claims the line in factory/backlog.md with one edit so two sessions never take the same item.", ".claude/skills/factory/SKILL.md")
n("cmd-stop", "/factory stop | resume", "public", "Pauses unfinished jobs and picks them up again.", "You are stopping work, or a session limit cut a run off.",
  "Pause stops the next stage from starting; a subagent already running can only be stopped by interrupting the session. Resume continues from the job files.", ".claude/skills/factory/SKILL.md")
n("cmd-metrics", "/factory metrics", "public", "Cycle time, first-pass rate, review rounds, escalation rate.", "You want to see how the factory is doing.",
  "Runs metrics.py over the job.json files; nothing is stored separately.", "factory/scripts/metrics.py")
n("cmd-lessons", "/factory lessons", "public", "Groups review findings that recur across jobs and suggests a fix for each.", "You have several jobs of history.",
  "Reads every CHANGES review, groups near-identical findings seen in at least two jobs, and suggests architecture, types, lint, test or rule, strongest first. You decide; nothing is changed for you.", "factory/scripts/lessons.py")
n("cmd-doctor", "/factory doctor", "public", "Checks that a repo is ready for the factory.", "Before the first job, and after any setup change.",
  "Checks AGENTS.md covers setup, tests, build, dev server, layout, conventions and what not to touch, and that policy, hooks, gitignore, helper skills and verify-app are in place.", "factory/scripts/doctor.py")
n("cmd-init", "/factory init", "public", "Drafts AGENTS.md (and VERIFY.proposed.md for an app) for a new repo.", "The repo has no project doc yet.",
  "Spawns the onboarder. If AGENTS.md exists it writes AGENTS.proposed.md instead; you merge it.", ".claude/skills/factory/SKILL.md")
n("cmd-review", "/factory review", "public", "Reviews any branch or pull request.", "You want a second opinion outside a factory job.",
  "Runs review_branch.py; a read-only agent reviews against REVIEW.md and a script drops comments not on a real diff line. Nothing is posted.", "factory/scripts/review_branch.py", sub="<branch | --pr N>")
n("cmd-maintain", "/factory maintain", "public", "Runs the maintain loop: collect, run, scan, triage, schedule.", "You want to watch the product, not just build features.",
  "Detection is plain statistics; the model only diagnoses and writes. A serious breach becomes an intent that waits for you.", ".claude/skills/factory/SKILL.md")

# ---------------------------------------------------------------- stages (lane)
n("intake", "Intake", "lane", "Turns an idea into an accepted intent.", "Every job starts here unless intent is waived.",
  "intent-writer writes intent.md in your own words, with guesses marked and open questions listed. You answer them and accept.", "factory/templates/intent.md", sub="idea → accepted intent", opens="intake")
n("spec", "Spec", "lane", "Turns the intent into a spec you approve.", "After you accept the intent.",
  "spec-writer writes risk, design and testable acceptance criteria, and a Split section for work too big for one change. A human gate follows.", None, sub="spec.md + your approval", opens="spec")
n("plan", "Plan", "lane", "Writes the plan before any code.", "After you approve the spec.",
  "planner reads the real code and writes ordered steps, a proof for each criterion, the blast radius and the rollback.", None, sub="plan.md", opens="plan")
n("build", "Build", "lane", "Implements the plan in the job's worktree.", "After the plan is READY.",
  "builder works test-first, ticks the Definition of Done, observes the real artifact, and commits. It is resumed when reviewers return CHANGES.", None, sub="builder in a worktree", opens="build")
n("review", "Review", "lane", "Four lenses review the branch in parallel.", "After each build round.",
  "security, ux, ui and code reviewers each write one file. The round is done only when all four exist.", None, sub="4 reviewers in parallel", opens="review")
n("approve", "Approve", "lane", "Decides whether the branch merges.", "After all four reviews PASS.",
  "approver tries to disprove its own decision, then writes APPROVE or ESCALATE with a merge-danger block.", None, sub="APPROVE or ESCALATE", opens="approve")
n("gate", "Merge gate", "lane", "The only way a job reaches main.", "After APPROVE, or after /factory approve.",
  "merge_gate.py checks the decision, the pinned commit, policy and dependencies, proves the merge on a throwaway copy, then merges. It never pushes.", "factory/scripts/merge_gate.py", sub="only way to main", opens="gate")
n("install", "Install", "lane", "How to put Forgeline in a repository.", "Once per repo.",
  "Copy .claude/ and factory/, ignore the runtime files, run doctor, set your verify commands, and run the evals.", None, sub="copy, doctor, policy", opens="install")
n("agents", "All 14 agents", "lane", "Who writes what.", "Whenever you want to know which agent owns a file.",
  "Nine agents run the job loop; five sit beside it. Each writes exactly one file and never merges, pushes or deploys.", ".claude/agents/", sub="who writes what", opens="agents")
n("guardrails", "Guardrails", "lane", "What stops an agent.", "Always on.",
  "Hooks, the policy file, the weakened-bar scan, secrets checks, the audit trail and the merge gate.", "factory/policy.json", sub="hooks, policy, scans", opens="guardrails")
n("split", "Split jobs", "lane", "Big work becomes dependent child jobs.", "The spec-writer adds a Split section.",
  "Children inherit the accepted intent, wait on their dependencies, and are specced only after those have merged.", "factory/scripts/jobctl.py", sub="big work → child jobs", opens="split")
n("parallel", "Parallel + worktrees", "lane", "One session per job.", "You run several jobs at once.",
  "Each job has its own branch, worktree, ports and browser session, so jobs never touch each other.", None, sub="one session per job", opens="parallel")
n("maintain", "Maintain loop", "lane", "Watches the running product and the repo.", "On a schedule, or when you run /factory maintain.",
  "Collects metrics, detects breaches, diagnoses read-only, and scans four lenses. It never merges, deploys or pushes.", "factory/maintain/", sub="watch, diagnose, scan", opens="maintain")
n("dashboard", "Dashboard + metrics", "lane", "A live board over factory/jobs.", "While jobs run.",
  "dashboard.html polls every two seconds; metrics and lessons read the same job files.", "factory/dashboard.html", sub="live board, cycle time", opens="dashboard")
n("evals", "Evals + CI", "lane", "Proof that the factory itself still works.", "After any change to .claude/ or factory/.",
  "326 offline checks with no model, 17 live agent cases on fixture repos, and a CI workflow.", "factory/evals/", sub="326 offline, 17 live", opens="evals")

# ---------------------------------------------------------------- agents (lane)
AG = ".claude/agents/"
n("intent-writer", "intent-writer", "lane", "Writes intent.md in the originator's own words.", "At /factory intent.",
  "Quotes your words verbatim, marks guesses, lists open questions with suggested defaults, and never designs the solution. Model: sonnet.", AG + "intent-writer.md", sub="sonnet · intent.md")
n("spec-writer", "spec-writer", "lane", "Writes spec.md: risk, design, criteria, and a Split when needed.", "After the intent is accepted.",
  "Reads AGENTS.md, the code, the intent, out-of-scope.md, the glossary and ADRs. Rates Risk high for CI, deploy, money or access. Model: opus.", AG + "spec-writer.md", sub="opus · spec.md")
n("planner", "planner", "lane", "Writes plan.md. Never edits code.", "After the spec is approved.",
  "Cites real source and pinned versions for any API it relies on, labels each safety claim by how far it was checked, and writes PLAN: BLOCKED if the spec needs a frozen path. Model: opus.", AG + "planner.md", sub="opus · plan.md")
n("builder", "builder", "lane", "Implements the plan and writes build.md.", "After PLAN: READY, and again after each CHANGES round.",
  "Named builder-<job-id> so it can be resumed. Works only in the worktree, runs tdd, uses verify-app for UI, ticks the Definition of Done. Model: opus.", AG + "builder.md", sub="opus · build.md + commits")
n("reviewer-security", "reviewer-security", "lane", "Security lens.", "Every review round.",
  "Applies factory/checklists/security.md to the diff: access control, input handling, data exposure, secrets, dependencies, workflow files. Model: opus.", AG + "reviewer-security.md", sub="opus · review file")
n("reviewer-ux", "reviewer-ux", "lane", "Experience lens.", "Every review round.",
  "Applies the accessibility checklist (flow) and must open the page in agent-browser when the diff changes what it renders. Has the Skill tool for verify-app. Model: sonnet.", AG + "reviewer-ux.md", sub="sonnet · review file")
n("reviewer-ui", "reviewer-ui", "lane", "Visual lens.", "Every review round.",
  "Checks tokens, spacing, contrast and responsive behaviour against the repo's own styles, and opens the page. Model: sonnet.", AG + "reviewer-ui.md", sub="sonnet · review file")
n("reviewer-code", "reviewer-code", "lane", "Correctness lens.", "Every review round.",
  "Checks the diff against the spec and plan, the weakened bar, the Definition of Done ticks, and the performance, observability and testing checklists. Model: sonnet.", AG + "reviewer-code.md", sub="sonnet · review file")
n("approver", "approver", "lane", "The final gate: APPROVE or ESCALATE.", "After all four reviews PASS.",
  "Re-runs a command from build.md, checks the one claim most likely wrong, runs policy_check.py, and ends decision.md with Door, Blast radius and Evidence. Model: opus.", AG + "approver.md", sub="opus · decision.md")
n("onboarder", "onboarder", "lane", "Drafts AGENTS.md for an unfamiliar repo.", "At /factory init.",
  "Reads manifests and config and runs only read commands. Writes UNKNOWN: ask the owner for anything it cannot find. For an app it also drafts VERIFY.proposed.md. Model: sonnet.", AG + "onboarder.md", sub="sonnet · AGENTS.md")
n("pr-reviewer", "pr-reviewer", "lane", "Reviews any branch or pull request.", "At /factory review.",
  "Read-only. A script drops any comment whose file, line or quoted code is not in the diff, so an invented comment cannot reach a PR. Model: opus.", AG + "pr-reviewer.md", sub="opus · review.json")
n("diagnoser", "diagnoser", "lane", "Explains a metric breach, read-only.", "A metric leaves its band.",
  "Checks that the metric measures what the band assumes, then lists competing hypotheses and the evidence that separates them. Model: opus.", AG + "diagnoser.md", sub="opus · diagnosis.md")
n("scanner-security", "scanner-security", "lane", "Security scan lens.", "At /factory maintain scan.",
  "Tries to disprove each candidate; a script then checks every finding against a real file, line and quoted text. Model: opus.", AG + "scanner-security.md", sub="opus · findings.json")
n("scanner-quality", "scanner-quality", "lane", "Maintainability scan lens.", "At /factory maintain scan.",
  "Looks for swallowed errors, dead code, duplicated logic and untested risky code. Model: opus.", AG + "scanner-quality.md", sub="opus · findings.json")

# ---------------------------------------------------------------- external skills / tools
PO = {"author": "mattpocock", "origin": "mattpocock-skills", "external": True}
n("tdd", "tdd", "external", "Red-green-refactor, one vertical slice at a time.", "Every build.", "Pinned to one commit and installed by install_helper_skills.py. The builder must call it before its first edit when it is installed.", "factory/skills/helper-skills.json", **PO)
n("diagnosing-bugs", "diagnosing-bugs", "external", "Reproduce, minimise, hypothesise, instrument, fix, regress.", "A bugfix job.", "Used by the builder for Type: bugfix to build the failing-test feedback loop.", "factory/skills/helper-skills.json", **PO)
n("codebase-design", "codebase-design", "external", "Deep modules with small interfaces.", "The plan's interface or module shape is unclear.", "Vocabulary for the planner and builder: module, interface, depth, seam.", "factory/skills/helper-skills.json", **PO)
n("code-review", "code-review", "external", "Standards and Spec axes for a review.", "reviewer-code and pr-reviewer.", "Applied inside one review; no sub-agents.", "factory/skills/helper-skills.json", **PO)
n("grilling", "grilling", "external", "Interview method for open questions.", "At /factory accept with unanswered questions.", "Used by the orchestrator, never inside a subagent: nobody is there to answer.", "factory/skills/helper-skills.json", **PO)
n("agent-browser", "agent-browser", "external", "Browser automation CLI used with your installed Chrome.", "The builder and the UX and UI reviewers look at a page.", "Every call passes --session <job-id>-<role> so jobs never share a browser. Install it yourself; pin a version.", None,
  author="vercel-labs", origin="vercel-labs/agent-browser", external=True)
n("verify-app", "verify-app", "board", "Your repo's own account of how to start the app and what each area should show.", "Builder and UI reviewers, when it is installed.",
  "Drafted by the onboarder as VERIFY.proposed.md; a person reads it and installs it as .claude/skills/verify-app/SKILL.md. Doctor warns until it exists.", "factory/templates/verify-app.md", sub="per-repo skill")

# ---------------------------------------------------------------- scripts
SC = "factory/scripts/"
n("jobctl", "jobctl.py", "script", "The only writer of job state.", "Every stage change.", "create, set, bump, pause, resume, active, ready, show. Claims the next job number with a plain mkdir so two sessions never clash.", SC + "jobctl.py", sub="job state")
n("snapshot-audit", "snapshot_audit.py", "script", "Commits the job folder to the job branch.", "After each artifact.", "Copies factory/jobs/<id>/ to factory/audit/<id>/ in the worktree and commits it, so the whole record merges with the change.", SC + "snapshot_audit.py")
n("policy-check", "policy_check.py", "script", "Matches changed files against policy.json.", "The approver and the merge gate.", "Prints VIOLATION for a frozen path, ESCALATE-TRIGGER for escalate paths, dependency files, size and a weakened bar (suppressions, skipped or deleted tests, stripped assertions).", SC + "policy_check.py")
n("merge-gate", "merge_gate.py", "script", "The only route to main.", "After APPROVE or /factory approve.", "One lock, ordered checks, a throwaway trial merge, verify and ratchets, then the real merge. Exit codes 0 merged, 3 human, 4 refused, 5 verify failed, 6 lock held, 7 merge failed.", SC + "merge_gate.py", opens="gate")
n("constraints-py", "constraints.py", "script", "Ratchets: a measured number must not fall.", "Inside the merge gate.", "Runs each merge_policy.constraints command on the merged result and compares with the baseline read from the base checkout, so a branch cannot lower it. Exceptions need an owner and an expiry within a year.", SC + "constraints.py")
n("adr-py", "adr.py", "script", "Records a merged Design section as an ADR.", "After a merge.", "Commits docs/adr/NNNN-slug.md when the spec has a real Design section. Turn it off with policy.adr.dir set to an empty string.", SC + "adr.py")
n("doctor-py", "doctor.py", "script", "Readiness checks.", "/factory doctor.", "PASS, WARN or FAIL per check; exit 1 on any FAIL.", SC + "doctor.py")
n("lessons-py", "lessons.py", "script", "Groups repeated review findings.", "/factory lessons.", "Word-overlap grouping across CHANGES reviews in jobs and audit copies; suggestions come from a small hint table. Read the groups yourself.", SC + "lessons.py")
n("metrics-py", "metrics.py", "script", "Cycle time and rates.", "/factory metrics.", "Computed from job.json history; nothing else is stored.", SC + "metrics.py")
n("review-branch", "review_branch.py", "script", "Reviews any branch or PR.", "/factory review.", "Runs the pr-reviewer, validates every comment against the diff, and writes gh-review.sh for you to run. It never posts.", SC + "review_branch.py")
n("install-helpers", "install_helper_skills.py", "script", "Installs five pinned MIT skills.", "At setup.", "Clones at the commit pinned in helper-skills.json. Read the skills first: they become instructions your agents follow.", SC + "install_helper_skills.py")
n("managed-install", "managed/install.py", "script", "Installs the hooks as managed settings.", "An admin step.", "Dry run by default, --apply to write. Makes the hooks impossible for a repo writer to disable.", "factory/managed/install.py")
n("collect-py", "collect.py", "script", "Gathers real metric values.", "On a schedule.", "Collectors: a command that prints a number, an HTTP JSON endpoint, a log's error rate, git, or the factory's own cycle time.", "factory/maintain/collect.py")
n("detect-py", "detect.py", "script", "Tests each metric against its own baseline.", "After collect.", "1 sigma logs, 2 sigma diagnoses, 3 sigma acts. Plain statistics; no model.", "factory/maintain/detect.py")
n("scan-py", "scan.py", "script", "Runs the four scan lenses.", "Weekly, or /factory maintain scan.", "Security and quality use agents; secrets and dependencies need no model. Every finding is verified against the repo and marked new, recurring or dismissed.", "factory/maintain/scan.py", opens="scan-py")
n("dismiss-py", "dismiss.py", "script", "Dismisses a breach with a reason.", "A metric cries wolf.", "Needs a reason and widens that metric's band.", "factory/maintain/dismiss.py")
n("schedule-py", "schedule.py", "script", "Prints or installs the cron block.", "Once, at setup.", "Runs collect and run hourly, scans weekly and the evals weekly. Tested against a crontab file, not installed.", "factory/maintain/schedule.py")
n("run-evals", "run_evals.py", "script", "326 offline checks, no model.", "After every change.", "Covers config, hooks, managed settings, maintain, scan, the merge gate, scripts and artifact formats. Needs Python 3.12 or newer.", "factory/evals/run_evals.py")
n("agent-evals", "agent_evals.py", "script", "17 live agent cases.", "After a prompt change.", "Runs each agent on a fixture repo and checks its output file. About 15 minutes of subscription use; one failure can be a flake, so re-run it once.", "factory/evals/agent_evals.py")
n("ci-workflow", "factory-evals.yml", "script", "Runs the offline evals in CI.", "On any change to .claude/, factory/, AGENTS.md or CLAUDE.md.", "A GitHub Actions workflow on Python 3.12.", ".github/workflows/factory-evals.yml")

# ---------------------------------------------------------------- hooks / guards
HK = ".claude/hooks/factory_hooks.py"
n("hook-edits", "Hook: edits", "hook", "Refuses edits to frozen paths and to tests during a bug fix.", "Every Edit or Write inside a factory worktree.", "Reads factory/policy.json. Path rules apply only inside worktrees, so you are never blocked in your own checkout.", HK, sub="frozen paths, test lock")
n("hook-bash", "Hook: commands", "hook", "Blocks push, deploy, publish, secrets in a commit, and a hand-merge of a factory branch.", "Every Bash call.", "Read-only git merge-tree and merge-base are allowed. A person authorises a release by starting Claude Code with FACTORY_RELEASE_AUTHORIZED=1; an inline prefix does not count.", HK, sub="push, deploy, secrets")
n("weakened-bar", "Weakened-bar scan", "hook", "Flags a quietly lowered quality bar.", "Every diff the approver or gate checks.", "Added @ts-ignore, eslint-disable, noqa, skipped or deleted tests, stripped assertions. Each is an ESCALATE-TRIGGER, not a failure, so a person decides.", SC + "policy_check.py")
n("secrets-scan", "Secrets in commits", "hook", "Blocks committing secrets.", "Every commit command.", "The bash hook scans staged content for common key formats. It complements a real scanner.", HK)
n("escalate-triggers", "Escalate triggers", "hook", "What always sends a job to a person.", "At the approver and the gate.", "CI or deploy config, schema migrations, new dependencies, money, access or identity, a change over the size cap, a waived intent, a weakened bar, a high-risk spec.", "factory/policy.json")
n("test-lock", "Test lock (bugfix)", "hook", "Tests are frozen after the failing-test commit.", "Type: bugfix.", "The builder commits a failing test, touches .factory-test-lock, and a hook then refuses test edits, so the code is fixed, never the test.", HK)
n("release-var", "Release variable", "hook", "Only a person can authorise a push or deploy.", "You start Claude Code yourself.", "FACTORY_RELEASE_AUTHORIZED=1 must be in the environment of the session you start; an agent cannot set it for the hook.", "factory/policy.json")
n("intent-inherit", "Inherited intent", "hook", "Split children carry the parent's accepted intent.", "A child is created.", "No waiver is recorded, so the approver does not auto-escalate a child.", SC + "jobctl.py")
n("dep-check", "Dependency check", "hook", "A child whose dependency has not merged is refused.", "Inside the merge gate.", "Reads depends_on from job.json and each dependency's stage.", SC + "merge_gate.py")
n("merge-lock", "Merge lock", "hook", "One merge at a time.", "Inside the merge gate.", "A second gate run exits 6; you run it again. Stale after merge_policy.lock_stale_minutes.", SC + "merge_gate.py")
n("check-clean", "Clean main", "hook", "Main must be on the base branch with no stray changes.", "First gate check.", "A dirty tree (for example __pycache__ that is not ignored) is refused.", SC + "merge_gate.py")
n("check-decision", "Decision present", "hook", "APPROVE, or ESCALATE plus a human.", "Second gate check.", "ESCALATE merges only with the human-approved flag, passed only after /factory approve.", SC + "merge_gate.py")
n("check-pinned", "Commit pinned", "hook", "The approval is bound to a commit.", "Third gate check.", "job.reviewed_sha must equal the branch head, or every later commit must touch only the audit folder. A code commit after the review voids the approval.", SC + "merge_gate.py")
n("check-policy", "Policy + intent", "hook", "Frozen paths, escalate paths, size and intent.", "Fourth gate check.", "A frozen-path edit is always refused. Escalate paths, dependency files, size over the cap, or a waived intent need a human.", SC + "merge_gate.py")
n("trial-merge", "Trial merge", "script", "Merge into a throwaway copy of main as it is now.", "After the checks pass.", "Catches a branch that merges cleanly but no longer builds against a base that moved.", SC + "merge_gate.py")
n("verify-cmds", "verify_commands", "script", "Your build and tests, on the merged result.", "Inside the trial merge.", "Set merge_policy.verify_commands in policy.json. Empty prints NO VERIFY; require_verify refuses outright.", "factory/policy.json")
n("real-merge", "Real merge", "script", "--no-ff merge, then cleanup.", "After proof.", "Removes the worktree and branch, sets stage merged, records an ADR. Never pushes.", SC + "merge_gate.py")

# ---------------------------------------------------------------- state / files (board)
n("intent-md", "intent.md", "board", "Your words, guesses marked, open questions.", "Written by intent-writer.", "First line INTENT: DRAFT; it is read as accepted once you accept it.", "factory/templates/intent.md", sub="factory/jobs/<id>/")
n("spec-md", "spec.md", "board", "Risk, design, requirements, acceptance criteria, optional Split.", "Written by spec-writer.", "Each criterion is one observable behaviour plus how to verify it.", None, sub="factory/jobs/<id>/")
n("plan-md", "plan.md", "board", "Steps, proof, blast radius, rollback.", "Written by planner.", "First line PLAN: READY or PLAN: BLOCKED.", None, sub="factory/jobs/<id>/")
n("build-md", "build.md", "board", "Evidence for every criterion, the Definition of Done, plan adherence.", "Written by builder.", "First line STATUS: READY or BLOCKED. Rewritten each round with a Log.", None, sub="factory/jobs/<id>/")
n("review-files", "review-*.md", "board", "One verdict file per reviewer per round.", "Written by each reviewer.", "First line VERDICT: PASS or VERDICT: CHANGES. A review that exists only in a message does not count.", None, sub="round-N/")
n("decision-md", "decision.md", "board", "APPROVE or ESCALATE, with a merge-danger block.", "Written by approver.", "Door (one-way or two-way), Blast radius, Evidence.", None, sub="factory/jobs/<id>/")
n("job-json", "job.json", "board", "Stage, round, reviews, history, parent and dependencies.", "Written only by jobctl.py.", "The dashboard and metrics read it.", None, sub="factory/jobs/<id>/")
n("policy-json", "policy.json", "board", "The rules.", "Read by hooks, policy_check and the gate.", "frozen_paths, escalate_paths, dependency_files, test_globs, blocked_commands, ticketing, merge_policy, adr. Agents cannot edit it.", "factory/policy.json")
n("dod", "Definition of done", "board", "A standing bar every job clears.", "The builder ticks it; reviewers and approver check it.", "Correctness, quality, integration, documentation, ship readiness. Frozen to agents.", "factory/DEFINITION_OF_DONE.md")
n("review-md", "REVIEW.md", "board", "What counts as Important versus a Nit.", "Every reviewer reads it.", "Important blocks; a Nit goes under Notes, at most five.", "factory/REVIEW.md")
n("checklists", "checklists/", "board", "Security, accessibility, performance, observability, testing.", "Each reviewer applies the one for its pass.", "Short lists; an item the diff does not touch is skipped without comment.", "factory/checklists/")
n("out-of-scope", "out-of-scope.md", "board", "Decisions already made not to build something.", "intent-writer and spec-writer read it.", "A person adds a line; agents may not.", "factory/out-of-scope.md")
n("glossary", "docs/GLOSSARY.md", "board", "The project's terms.", "intent-writer, spec-writer and planner read it.", "Write one in your repo; it is not part of Forgeline.", None)
n("adr-dir", "docs/adr/", "board", "Durable decisions.", "Written by the merge gate after a merge.", "A real Design section becomes NNNN-slug.md. The spec-writer and planner read them.", "factory/scripts/adr.py")
n("constraints-json", "constraints.json", "board", "Ratchet baselines and exceptions.", "Read by the merge gate from the base checkout.", "A person raises a baseline; the gate only reports when a number improved.", "factory/constraints.json")
n("worktree", "git worktree", "board", "One checkout per job.", "Created at /factory accept.", "<repo>-factory/<job-id> on branch factory/<job-id>. Agents change code only here.", None)
n("audit-trail", "Audit trail", "board", "factory/audit/<job-id>/ on the branch.", "After each stage.", "Committed by snapshot_audit.py so the whole record merges with the change.", SC + "snapshot_audit.py")
n("backlog", "backlog.md", "board", "Queue for /factory next.", "Maintain triage accepts findings into it.", "One unchecked line per item.", "factory/backlog.md")
n("dashboard-html", "dashboard.html", "board", "The live board.", "cd factory && python3 -m http.server.", "Polls factory/jobs every two seconds. No build step.", "factory/dashboard.html", sub="localhost:8000")
n("agents-md", "AGENTS.md", "board", "Your repo's own instructions.", "Read by every agent first.", "Setup, tests, build, lint, dev server and port, layout, conventions, what not to touch. The agents carry nothing repo-specific.", None)
n("incident-md", "incident.md", "board", "A serious breach, written up.", "A metric reaches 3 sigma.", "Becomes an intent that waits for you.", "factory/maintain/")
n("collectors-json", "collectors.json", "board", "Where metrics come from.", "Edit it for your service.", "Commands, HTTP endpoints, log files, git, the factory itself.", "factory/maintain/collectors.json")
n("findings", "findings", "board", "Scan results, each verified.", "After a scan.", "New, recurring or previously dismissed; sorted by severity.", "factory/maintain/")
n("triage", "triage", "public", "Accept a finding into the backlog, or dismiss it.", "After a scan.", "Dismiss needs a reason and the finding is not raised again.", ".claude/skills/factory/SKILL.md", sub="accept or dismiss")
n("session", "Claude session", "public", "One Claude Code session per job.", "You open one per job.", "A session orchestrates only the job it started.", None, sub="/factory <job>")
n("ports", "Ports + sessions", "board", "Builder 5100+10n, ux +1, ui +2.", "Each job.", "Each job and reviewer also gets its own agent-browser session.", None)
n("slice", "Slice (child job)", "lane", "A full job: spec, build, reviews, approver, gate.", "After its dependency merged.", "Specced against the code as it then is, so it reads the real earlier work and the ADR.", SC + "jobctl.py", sub="depends on the one before")
n("parent-close", "Parent closes", "script", "A split parent merges when every child has merged.", "jobctl ready --close-parents.", "The parent builds nothing; its worktree stays as the audit record.", SC + "jobctl.py")
n("copy-step", "Copy .claude/ + factory/", "public", "Put the files in your repo.", "First install step.", "Start with an empty factory/jobs/ and an empty backlog.", None, sub="into the repo root")
n("gitignore", ".gitignore.factory", "script", "Lines to add to your .gitignore.", "Install step 2.", "/factory/jobs/, the test lock, __pycache__/. Without __pycache__ ignored the gate sees a dirty tree.", ".gitignore.factory")
n("policy-edit", "Edit policy.json", "board", "Make the rules yours.", "Install step 4.", "escalate_paths, frozen_paths, test_globs and, above all, merge_policy.verify_commands.", "factory/policy.json")
n("python312", "Python 3.12+", "hook", "Needed by the evals and maintain/scan.py.", "Always.", "The system Python 3.9 fails with a SyntaxError in scan.py. uv run --python 3.12 works.", None)
n("audit-md", "AUDIT.md", "board", "What is proven and what is not.", "Read it before trusting a part.", "Evidence from the offline evals, the live evals and the end-to-end runs.", "AUDIT.md")
n("e2e", "End-to-end runs", "board", "Jobs run on a fixture repo.", "After big changes.", "Natural jobs, escalate with rework, a split job, UI jobs, and a CHANGES round on a fault-injected defect.", "AUDIT.md")

# ---------------------------------------------------------------- views
JOB = ["intake", "spec", "plan", "build", "review", "approve", "gate"]
AROUND = ["commands", "install", "agents", "guardrails", "split", "parallel", "maintain", "dashboard", "evals"]
view("root", None, "Forgeline",
     "A software factory for Claude Code. One job runs from idea to main with two human gates; open any area for its agents, files, scripts and guardrails.",
     JOB + AROUND,
     [("intake", "spec", "accepted"), ("spec", "plan", "approved"), ("plan", "build", "plan.md"), ("build", "review", "round N"),
      ("review", "approve", "all PASS"), ("approve", "gate", "APPROVE"), ("review", "build", "CHANGES")],
     containers=[{"id": "job-loop", "label": "One job: idea → main", "nodeIds": JOB}, {"id": "around", "label": "Around the loop", "nodeIds": AROUND}],
     mainSteps=True, render="process", stepIds=JOB)

view("intake", "root", "Intake · idea → accepted intent", "Intent is required by default. You answer the open questions, then accept.",
     ["cmd-intent", "jobctl", "intent-writer", "intent-md", "cmd-accept", "worktree", "out-of-scope", "glossary", "intent-inherit"],
     [("cmd-intent", "jobctl", "creates the job"), ("jobctl", "intent-writer", "spawns"), ("intent-writer", "intent-md", "writes"),
      ("intent-md", "cmd-accept", "you accept"), ("cmd-accept", "worktree", "creates"), ("out-of-scope", "intent-writer", "read"), ("glossary", "intent-writer", "read")])

view("spec", "root", "Spec · design the change", "The spec-writer proposes; you approve. A big spec adds a Split section.",
     ["spec-writer", "spec-md", "cmd-approve-spec", "cmd-respec", "out-of-scope", "glossary", "adr-dir", "split", "agents-md"],
     [("spec-writer", "spec-md", "writes"), ("spec-md", "cmd-approve-spec", "you approve"), ("spec-md", "cmd-respec", "or send back"), ("cmd-respec", "spec-writer", "revise"),
      ("out-of-scope", "spec-writer", "read"), ("glossary", "spec-writer", "read"), ("adr-dir", "spec-writer", "read"), ("agents-md", "spec-writer", "read"), ("spec-md", "split", "Split section")])

view("plan", "root", "Plan · before any code", "The planner reads real code and cites real source; claims are labelled by how far they were checked.",
     ["planner", "plan-md", "codebase-design", "adr-dir", "policy-json", "cmd-approve-spec"],
     [("cmd-approve-spec", "planner", "starts"), ("planner", "plan-md", "writes"), ("codebase-design", "planner", "vocabulary"), ("adr-dir", "planner", "read"), ("policy-json", "planner", "frozen paths")])

view("build", "root", "Build · in the job's worktree", "Test first, observe the real thing, tick the Definition of Done, commit. Resumed on CHANGES, at most twice.",
     ["builder", "tdd", "diagnosing-bugs", "codebase-design", "verify-app", "agent-browser", "test-lock", "weakened-bar", "dod", "build-md", "worktree", "snapshot-audit"],
     [("builder", "tdd", "calls"), ("builder", "diagnosing-bugs", "bugfix"), ("builder", "codebase-design", "if unclear"), ("builder", "verify-app", "UI criteria"),
      ("verify-app", "agent-browser", "drives"), ("builder", "build-md", "writes"), ("dod", "build-md", "ticked in"), ("test-lock", "builder", "blocks"), ("weakened-bar", "builder", "forbids"),
      ("builder", "worktree", "edits only here"), ("build-md", "snapshot-audit", "committed by")])

view("review", "root", "Review · four lenses in parallel", "Each reviewer writes one file. The round is done only when all four exist; a reviewer that returns without its file is re-spawned once.",
     ["reviewer-security", "reviewer-ux", "reviewer-ui", "reviewer-code", "checklists", "review-md", "review-files", "verify-app", "agent-browser", "code-review", "dod"],
     [("checklists", "reviewer-security", "security.md"), ("checklists", "reviewer-ux", "accessibility.md"), ("review-md", "reviewer-code", "Important vs Nit"), ("verify-app", "reviewer-ux", "read first"), ("reviewer-ux", "agent-browser", "opens the page"), ("reviewer-ui", "agent-browser", "opens the page"),
      ("code-review", "reviewer-code", "axes"), ("dod", "reviewer-code", "check ticks"),
      ("reviewer-security", "review-files", "writes"), ("reviewer-ux", "review-files", "writes"), ("reviewer-ui", "review-files", "writes"), ("reviewer-code", "review-files", "writes")])

view("approve", "root", "Approve · try to disprove first", "APPROVE merges with no human looking; ESCALATE stops at needs-human.",
     ["approver", "policy-check", "weakened-bar", "escalate-triggers", "decision-md", "cmd-approve", "cmd-rework", "dod", "merge-gate"],
     [("approver", "policy-check", "runs"), ("policy-check", "weakened-bar", "includes"), ("escalate-triggers", "approver", "read"), ("dod", "approver", "spot-check"),
      ("approver", "decision-md", "writes"), ("decision-md", "merge-gate", "APPROVE"), ("decision-md", "cmd-approve", "ESCALATE: merge"), ("decision-md", "cmd-rework", "ESCALATE: change")])

view("gate", "root", "Merge gate · merge_gate.py <job-id>", "The only way to main. Checks run in order inside one lock; nothing is pushed.",
     ["merge-lock", "check-clean", "check-decision", "check-pinned", "check-policy", "dep-check", "trial-merge", "verify-cmds", "constraints-py", "real-merge", "adr-py", "constraints-json"],
     [("merge-lock", "check-clean", "takes"), ("check-clean", "check-decision", "ok"), ("check-decision", "check-pinned", "ok"), ("check-pinned", "check-policy", "ok"),
      ("check-policy", "dep-check", "ok"), ("dep-check", "trial-merge", "ok"), ("trial-merge", "verify-cmds", "runs"), ("verify-cmds", "constraints-py", "then"),
      ("constraints-json", "constraints-py", "baseline"), ("constraints-py", "real-merge", "pass"), ("real-merge", "adr-py", "then")])

view("split", "root", "Split jobs · big work → child jobs", "A split parent builds nothing; children run in dependency order and each is a full job.",
     ["spec-md", "cmd-approve-spec", "jobctl", "intent-inherit", "slice", "cmd-ready", "dep-check", "parent-close"],
     [("spec-md", "cmd-approve-spec", "has Split"), ("cmd-approve-spec", "jobctl", "creates children"), ("jobctl", "intent-inherit", "copies intent"), ("jobctl", "slice", "per slice"),
      ("cmd-ready", "slice", "starts ready"), ("dep-check", "slice", "refuses early"), ("slice", "parent-close", "all merged")])

view("parallel", "root", "Parallel jobs + git worktrees", "One session per job in the same repo; jobs never touch each other and merges are serialised.",
     ["session", "jobctl", "worktree", "ports", "merge-lock", "merge-gate", "agent-browser"],
     [("session", "jobctl", "claims a number"), ("jobctl", "worktree", "creates"), ("session", "ports", "gets"), ("ports", "agent-browser", "own session"),
      ("worktree", "merge-gate", "branch"), ("merge-gate", "merge-lock", "takes")])

view("agents", "root", "All 14 agents", "Nine run the job loop (four of them reviewers); five sit beside it. Each writes exactly one file.",
     ["intent-writer", "spec-writer", "planner", "builder", "reviewer-security", "reviewer-ux", "reviewer-ui", "reviewer-code", "approver",
      "onboarder", "pr-reviewer", "diagnoser", "scanner-security", "scanner-quality"],
     [("intent-writer", "spec-writer", "intent"), ("spec-writer", "planner", "spec"), ("planner", "builder", "plan"), ("builder", "reviewer-code", "branch"), ("reviewer-code", "approver", "all PASS")],
     containers=[{"id": "loop", "label": "Job loop", "nodeIds": ["intent-writer", "spec-writer", "planner", "builder", "approver"]},
                 {"id": "lenses", "label": "Review lenses", "nodeIds": ["reviewer-security", "reviewer-ux", "reviewer-ui", "reviewer-code"]},
                 {"id": "setup", "label": "Setup and any-branch review", "nodeIds": ["onboarder", "pr-reviewer"]},
                 {"id": "watch", "label": "Maintain loop (read-only)", "nodeIds": ["diagnoser", "scanner-security", "scanner-quality"]}])

view("guardrails", "root", "Guardrails", "Hooks prevent, scans detect, the audit trail records, and the merge gate is the only way to main.",
     ["policy-json", "hook-edits", "hook-bash", "managed-install", "release-var", "weakened-bar", "secrets-scan", "test-lock", "merge-gate", "audit-trail", "escalate-triggers"],
     [("policy-json", "hook-edits", "rules"), ("policy-json", "hook-bash", "rules"), ("managed-install", "policy-json", "enforces"), ("release-var", "hook-bash", "authorises"),
      ("hook-bash", "secrets-scan", "includes"), ("hook-edits", "test-lock", "includes"), ("weakened-bar", "escalate-triggers", "is one"), ("escalate-triggers", "merge-gate", "need a human"),
      ("merge-gate", "audit-trail", "record")])

view("maintain", "root", "Maintain loop · watch, diagnose, scan", "Detection is plain statistics. The model only explains a breach and writes it up; a person decides.",
     ["cmd-maintain", "collectors-json", "collect-py", "detect-py", "diagnoser", "incident-md", "cmd-accept", "scan-py", "triage", "backlog", "dismiss-py", "schedule-py"],
     [("cmd-maintain", "collect-py", "runs"), ("collectors-json", "collect-py", "config"), ("collect-py", "detect-py", "metrics"), ("detect-py", "diagnoser", "breach"),
      ("diagnoser", "incident-md", "3 sigma"), ("incident-md", "cmd-accept", "becomes an intent"), ("scan-py", "triage", "findings"), ("triage", "backlog", "accept"),
      ("triage", "dismiss-py", "dismiss"), ("schedule-py", "collect-py", "cron")])

view("dashboard", "root", "Dashboard + metrics", "dashboard.html, metrics and lessons all read the same job files.",
     ["dashboard-html", "job-json", "cmd-metrics", "metrics-py", "cmd-lessons", "lessons-py", "jobctl"],
     [("jobctl", "job-json", "writes"), ("job-json", "dashboard-html", "polled"), ("cmd-metrics", "metrics-py", "runs"), ("job-json", "metrics-py", "read"), ("cmd-lessons", "lessons-py", "runs"), ("job-json", "lessons-py", "read")])

view("evals", "root", "Evals + CI", "Offline checks need no model; live cases run each agent on a fixture repo; end-to-end runs are recorded in AUDIT.md.",
     ["run-evals", "agent-evals", "ci-workflow", "python312", "e2e", "audit-md"],
     [("run-evals", "python312", "needs"), ("run-evals", "ci-workflow", "run in CI"), ("e2e", "audit-md", "recorded in"), ("agent-evals", "audit-md", "recorded in")])

view("install", "root", "Install in a repo", "Copy, ignore the runtime files, run doctor, make the policy yours, then run your first job.",
     ["copy-step", "gitignore", "cmd-doctor", "cmd-init", "onboarder", "agents-md", "verify-app", "policy-edit", "install-helpers", "run-evals", "cmd-intent"],
     [("copy-step", "gitignore", "then"), ("gitignore", "cmd-doctor", "then"), ("cmd-doctor", "cmd-init", "if no AGENTS.md"), ("cmd-init", "onboarder", "spawns"), ("onboarder", "agents-md", "drafts"),
      ("onboarder", "verify-app", "drafts"), ("agents-md", "policy-edit", "then"), ("policy-edit", "install-helpers", "then"), ("install-helpers", "run-evals", "then"), ("run-evals", "cmd-intent", "first job")])




# ====================================================================== second level
# A view whose id equals a node id is that node's drill-down, so the node shows up stacked in its parent and the
# left-hand browser opens a second column for the area.
def d(id, label, kind, sub, what, when, how, source=None):
    n(id, label, kind, what, when, how, source, sub=sub)


del NODES["factory"]  # replaced by the per-command views under "Commands"

# ---- command-only nodes
d("skip-intent", '--skip-intent "reason"', "hook", "only a person", "The one waiver of the required intent.", "You decide the feature is too small for an intent.", "The reason is kept in job.json and the approver always escalates a waived intent. Never used on an agent's own judgment.", "factory/scripts/jobctl.py")
d("flag-ticket", "--ticket KEY", "board", "commit prefix", "Links the job to a ticket.", "Your prompt gives a ticket.", "Every commit starts with the key. With policy.ticketing.mcp_server set, the ticket is read at the start and the outcome is commented at the end.", "factory/policy.json")
d("flag-bugfix", "--type bugfix", "board", "failing test first", "Makes the builder reproduce the bug first.", "The job fixes a bug.", "The builder commits a failing test alone, then the test lock is created so the code is fixed, never the test.", ".claude/agents/builder.md")
d("claim-line", "Claim a backlog line", "script", "one edit", "Replaces the exact line with a checked, claimed one.", "Every /factory next.", "If the edit fails because the line changed, another session claimed it; the next unchecked item is tried.", ".claude/skills/factory/SKILL.md")
d("human-approval", "human-approval.md", "board", "your words, with the time", "The record of your merge approval.", "At /factory approve.", "Your instruction verbatim, the UTC time and the first line and Why of decision.md.")
d("rework-md", "rework-N.md", "board", "your note, verbatim", "What you want changed before it merges.", "At /factory rework.", "The fresh builder reads it with the existing build.md and every round folder.")
d("st-pause", "jobctl pause", "script", "--reason", "Marks a job paused with its stage and a reason.", "At /factory stop.", "The pause stops the next stage from starting; nothing is lost because the stage and files are the state.", "factory/scripts/jobctl.py")
d("st-resume", "jobctl resume", "script", "resume_at_stage", "Continues from the stage the job paused at.", "At /factory resume.", "spec: spec-writer if spec.md is missing; plan, build, review and approve each pick up from their files.", "factory/scripts/jobctl.py")
d("st-gate", "Gate refuses a paused job", "hook", "inside merge_gate.py", "A paused job cannot merge.", "Every gate run.", "Resume it first.", "factory/scripts/merge_gate.py")
d("st-limit", "A running subagent", "board", "cannot be killed", "Stop pauses the next stage only.", "A subagent is mid-run.", "Interrupt the session to stop it. Also what happens when the subscription session limit cuts a run off: resume from the files.")

# ---- intake
d("intent-template", "Intent template", "board", "factory/templates/intent.md", "The sections the intent-writer fills.", "Every intent.", "In the originator's words, assumptions, open questions, success criteria. First line INTENT: DRAFT.", "factory/templates/intent.md")
d("open-questions", "Open questions", "board", "each with a default", "Every gap a product owner must fill, phrased to answer in a line.", "While drafting the intent.", "A suggested default in brackets when there is an obvious one; you answer in the file or in chat.")
d("assumptions", "Assumptions (guess)", "board", "never a requirement", "Anything the intent-writer inferred, marked (guess).", "While drafting the intent.", "Kept apart from what you actually said so a guess is never read as a requirement.")
d("claim-number", "Claim a job number", "script", "mkdir, atomic", "Takes the next 3-digit job number with a plain mkdir.", "Every job creation.", "If another session wins the race it retries, so two sessions never share a number.", "factory/scripts/jobctl.py")
view("intent-writer", "intake", "intent-writer", "What it reads, what it fills in, and the one file it writes.",
     ["intent-writer", "agents-md", "out-of-scope", "glossary", "intent-template", "intent-md", "open-questions", "assumptions"],
     [("agents-md", "intent-writer", "read"), ("out-of-scope", "intent-writer", "read"), ("glossary", "intent-writer", "read"), ("intent-template", "intent-writer", "fills"),
      ("intent-writer", "intent-md", "writes"), ("intent-md", "open-questions", "has"), ("intent-md", "assumptions", "has")])
view("jobctl", "intake", "jobctl.py · the only writer of job state", "Every stage change goes through it, and every artifact is snapshotted onto the job branch.",
     ["claim-number", "jobctl", "job-json", "worktree", "snapshot-audit", "audit-trail"],
     [("claim-number", "jobctl", "number"), ("jobctl", "job-json", "writes"), ("jobctl", "worktree", "records path"), ("snapshot-audit", "audit-trail", "commits")])

# ---- spec
for i, (lab, w) in enumerate([("Risk", "low, medium or high with one line of reason; high for CI, deploy, money, access or data migration"),
                              ("Context", "where this lives in the codebase, with paths"),
                              ("Design", "decision, two named alternatives, consequences, interfaces; becomes an ADR after merge"),
                              ("Requirements", "a numbered list of what must be true when done"),
                              ("Acceptance criteria", "each one observable behaviour plus how to verify it"),
                              ("Out of scope", "what a builder might be tempted to do but must not"),
                              ("Split", "2 to 6 slices, each with Depends, only when the work is too big for one change"),
                              ("Assumptions", "decisions made where the request was ambiguous, each with a reason")]):
    d(f"sec-{i}", lab, "board", "section of spec.md", f"The {lab} section: {w}.", "Every spec." if lab != "Split" else "Only for work too big for one change.", "Written by the spec-writer; you approve the whole file.")
view("spec-md", "spec", "spec.md · what is in it", "Eight sections. A person approves the whole file, so the trade-offs are explicit.",
     ["spec-md"] + [f"sec-{i}" for i in range(8)], [("spec-md", f"sec-{i}", "") for i in range(8)])
d("spec-feedback", "spec-feedback-N.md", "board", "your note, verbatim", "A human sent the spec back.", "After /factory respec.", "The spec-writer addresses each point and says how under Assumptions.")
view("spec-writer", "spec", "spec-writer", "Reads the intent and the real code; writes only spec.md.",
     ["spec-writer", "intent-md", "agents-md", "out-of-scope", "glossary", "adr-dir", "spec-feedback", "spec-md"],
     [("intent-md", "spec-writer", "read"), ("agents-md", "spec-writer", "read"), ("out-of-scope", "spec-writer", "read"), ("glossary", "spec-writer", "read"), ("adr-dir", "spec-writer", "read"),
      ("spec-feedback", "spec-writer", "address"), ("spec-writer", "spec-md", "writes")])
d("spec-approval", "spec-approval.md", "board", "your words, with the time", "The record of your approval.", "At /factory approve-spec.", "Your instruction verbatim and the UTC time, because a human decision belongs in the record in the human's own words.")

# ---- plan
for i, (lab, w) in enumerate([("Approach", "how the change will be made, citing real source and the version read"),
                              ("Steps", "the files to change, in order"),
                              ("Proof", "the test that proves each acceptance criterion, at agreed seams"),
                              ("Blast radius", "everything else that depends on the changed files, with each safety claim labelled by how far it was checked"),
                              ("Policy flags", "frozen paths (the plan is BLOCKED) and escalate paths it touches"),
                              ("Risks and rollback", "what could go wrong and how to undo it")]):
    d(f"pl-{i}", lab, "board", "section of plan.md", f"The {lab} section: {w}.", "Every plan.", "Written by the planner; the builder follows it and reviewers check the diff against it.")
view("plan-md", "plan", "plan.md · what is in it", "First line PLAN: READY or PLAN: BLOCKED.", ["plan-md"] + [f"pl-{i}" for i in range(6)], [("plan-md", f"pl-{i}", "") for i in range(6)])
view("planner", "plan", "planner", "Reads the approved spec and the real code; never edits code.",
     ["planner", "spec-md", "agents-md", "policy-json", "adr-dir", "codebase-design", "plan-md"],
     [("spec-md", "planner", "read"), ("agents-md", "planner", "read"), ("policy-json", "planner", "frozen paths"), ("adr-dir", "planner", "read"), ("codebase-design", "planner", "vocabulary"), ("planner", "plan-md", "writes")])
for i, (lab, w) in enumerate([("Said so", "worthless on its own"), ("Pointed at a line", "a real file:line, or the library's own source"),
                              ("Walked the failure", "followed step by step and it does not reach"), ("Ran it", "a script or test that calls the real code and fails loudly if wrong")]):
    d(f"lad-{i}", lab, "board", f"evidence level {i + 1}", f"Evidence level {i + 1}: {w}.", "Each safety claim in the blast radius.", "Get each claim as far down this list as is cheap and say where it stopped. Anything still at level 1 goes under Risks as unproven.")
view("pl-3", "plan-md", "Blast radius · how far a claim was checked", "The planner labels each safety claim, so an asserted claim is never mistaken for a proven one.",
     ["pl-3", "lad-0", "lad-1", "lad-2", "lad-3"], [("lad-0", "lad-1", "stronger"), ("lad-1", "lad-2", "stronger"), ("lad-2", "lad-3", "stronger"), ("pl-3", "lad-0", "labelled")])

# ---- build
d("red-commit", "Failing test first", "board", "committed alone", "For a bugfix: a test that reproduces the bug, committed on its own.", "Type: bugfix.", "It must fail for the reason the spec describes. Then the lock is created and the code is fixed until it passes.")
view("tdd", "build", "tdd · test first", "Red before green, one slice at a time, at the seams the plan names.",
     ["tdd", "builder", "red-commit", "test-lock", "diagnosing-bugs"],
     [("builder", "tdd", "calls"), ("builder", "diagnosing-bugs", "bugfix"), ("diagnosing-bugs", "red-commit", "feedback loop"), ("red-commit", "test-lock", "then lock")])
view("verify-app", "build", "verify-app · look at the real app", "Your repo's own account of how to start the app, what each area should show and how to drive it.",
     ["verify-app", "onboarder", "agents-md", "doctor-py", "agent-browser", "builder", "reviewer-ux", "reviewer-ui"],
     [("onboarder", "verify-app", "drafts"), ("agents-md", "onboarder", "read"), ("doctor-py", "verify-app", "warns until it exists"), ("verify-app", "agent-browser", "drives"),
      ("builder", "verify-app", "uses"), ("reviewer-ux", "verify-app", "reads"), ("reviewer-ui", "verify-app", "reads")])
for i, (lab, w) in enumerate([("Correctness", "every criterion observed on the real artifact; a new test fails without the change"),
                              ("Quality", "no dead code, no duplicated logic, lint passes, no weakened bar"),
                              ("Integration", "callers checked, config and migrations accounted for, old callers keep working"),
                              ("Documentation", "AGENTS.md updated where behaviour changed; a decision worth keeping is in Design"),
                              ("Ship readiness", "untrusted input reviewed, a critical path logs enough, a risky change has a rollback")]):
    d(f"dod-{i}", lab, "board", "Definition of done", f"{lab}: {w}.", "Ticked in build.md every job.", "Each box is [x] with evidence or n/a with a reason, never blank.")
view("dod", "build", "Definition of done", "A standing bar for every job. The builder ticks it; the code reviewer and approver check the ticks.",
     ["dod", "dod-0", "dod-1", "dod-2", "dod-3", "dod-4", "build-md", "reviewer-code", "approver"],
     [("dod", f"dod-{i}", "") for i in range(5)] + [("build-md", "dod", "ticked in"), ("reviewer-code", "dod", "checks"), ("approver", "dod", "spot-checks")])
for i, (lab, w) in enumerate([("Added suppression", "@ts-ignore, eslint-disable, noqa, type: ignore"), ("Skipped test", "skip, xfail, focused only"), ("Deleted test file", "a test file removed"), ("Fewer assertions", "assertions removed from a test")]):
    d(f"wb-{i}", lab, "hook", "weakened bar", f"{lab}: {w}.", "Any diff the approver or gate checks.", "An ESCALATE-TRIGGER, not a failure: a person decides whether the reason holds.", "factory/scripts/policy_check.py")
view("weakened-bar", "build", "Weakened-bar scan", "Getting to green by lowering the bar is the failure this exists for.",
     ["weakened-bar", "wb-0", "wb-1", "wb-2", "wb-3", "policy-check", "reviewer-code", "approver"],
     [("weakened-bar", f"wb-{i}", "flags") for i in range(4)] + [("policy-check", "weakened-bar", "includes"), ("reviewer-code", "weakened-bar", "reads"), ("approver", "weakened-bar", "escalates")])
view("builder", "build", "builder", "Reads the approved plan and writes code only in the worktree.",
     ["builder", "spec-md", "plan-md", "agents-md", "policy-json", "tdd", "verify-app", "dod", "build-md", "worktree"],
     [("spec-md", "builder", "read"), ("plan-md", "builder", "follows"), ("agents-md", "builder", "read"), ("policy-json", "builder", "frozen paths"), ("builder", "tdd", "calls"), ("builder", "verify-app", "UI criteria"),
      ("builder", "worktree", "edits only here"), ("dod", "build-md", "ticked in"), ("builder", "build-md", "writes")])

# ---- review
for cid, lab, w in [("ck-security", "security.md", "input validation, parameterised queries, auth on every new route, no secrets, workflow least privilege"),
                    ("ck-access", "accessibility.md", "keyboard, focus, labels, status announcements, contrast, targets, reduced motion"),
                    ("ck-perf", "performance.md", "no query in a loop, indexes, bounded growth, streaming, measure before flagging"),
                    ("ck-obs", "observability.md", "log a failure once with context, no swallowed errors, visible retries"),
                    ("ck-test", "testing.md", "fails without the change, behaviour not implementation, no skips, deterministic")]:
    d(cid, lab, "board", "checklist", f"Checklist: {w}.", "The reviewer whose pass it belongs to reads it.", "Apply only the items the diff touches; skip the rest without comment. A broken item is a finding with a file and line.", "factory/checklists/" + lab)
view("reviewer-security", "review", "reviewer-security", "One lens, one checklist, one file.", ["reviewer-security", "ck-security", "review-md", "review-files"],
     [("ck-security", "reviewer-security", "applies"), ("review-md", "reviewer-security", "Important vs Nit"), ("reviewer-security", "review-files", "writes")])
view("reviewer-ux", "review", "reviewer-ux", "Opens the page when the diff changes what it renders.", ["reviewer-ux", "ck-access", "verify-app", "agent-browser", "review-md", "review-files"],
     [("ck-access", "reviewer-ux", "flow"), ("verify-app", "reviewer-ux", "read first"), ("reviewer-ux", "agent-browser", "opens the page"), ("review-md", "reviewer-ux", "Important vs Nit"), ("reviewer-ux", "review-files", "writes")])
view("reviewer-ui", "review", "reviewer-ui", "Looks at the page against the repo's own styles.", ["reviewer-ui", "ck-access", "verify-app", "agent-browser", "review-files"],
     [("ck-access", "reviewer-ui", "look"), ("verify-app", "reviewer-ui", "read first"), ("reviewer-ui", "agent-browser", "opens the page"), ("reviewer-ui", "review-files", "writes")])
view("reviewer-code", "review", "reviewer-code", "Checks the diff against the spec, the plan and the standing bar.",
     ["reviewer-code", "ck-perf", "ck-obs", "ck-test", "code-review", "dod", "weakened-bar", "plan-md", "spec-md", "review-files"],
     [("ck-perf", "reviewer-code", "applies"), ("ck-obs", "reviewer-code", "applies"), ("ck-test", "reviewer-code", "applies"), ("code-review", "reviewer-code", "axes"), ("dod", "reviewer-code", "check ticks"),
      ("weakened-bar", "reviewer-code", "reads"), ("plan-md", "reviewer-code", "adherence"), ("spec-md", "reviewer-code", "criteria"), ("reviewer-code", "review-files", "writes")])
d("rr-spawn", "Spawn all four", "script", "in one message", "The orchestrator starts the four reviewers together so they run in parallel.", "Each review round.", "Each gets the job paths, a round number and, for ux and ui, a port.")
d("rr-wait", "Wait for all four", "hook", "never resume mid-round", "The round is done only when all four review files exist.", "Each review round.", "The builder is never resumed mid-round.")
d("rr-respawn", "Re-spawn once", "hook", "if a file is missing", "A reviewer that returns without its file is run again once with a stronger prompt.", "A review file is missing or has no verdict.", "The orchestrator never writes a review itself and never takes a verdict from a reviewer's message; after a second miss it stops and tells you.")
d("rr-changes", "Any CHANGES", "script", "resume the builder", "Any CHANGES verdict resumes the builder with the round folder.", "After the round.", "At most max_resumes times; after that the job goes to needs-human.")
d("rr-pass", "All PASS", "script", "go to the approver", "Four PASS verdicts send the job to the approver.", "After the round.", "The reviewed commit is pinned first, so a later code commit voids the approval.")
view("review-files", "review", "Round rules", "How one review round is run and closed.",
     ["rr-spawn", "reviewer-code", "review-files", "rr-wait", "rr-respawn", "rr-changes", "rr-pass"],
     [("rr-spawn", "reviewer-code", "four lenses"), ("reviewer-code", "review-files", "writes"), ("review-files", "rr-wait", "all four?"), ("rr-wait", "rr-respawn", "a file is missing"),
      ("rr-wait", "rr-pass", "all PASS"), ("rr-wait", "rr-changes", "any CHANGES")])

# ---- approve
d("ap-disprove", "Disprove first", "hook", "before APPROVE", "Names the one thing most likely to be wrong and checks it.", "Before writing APPROVE.", "By reading code or running a command, not from build.md's account. If it cannot check it, it escalates.", ".claude/agents/approver.md")
d("ap-rerun", "Re-run a command", "hook", "from build.md", "Re-runs at least one command that build.md cites and spot-checks a criterion.", "Every approval.", "Reviews share the builder's blind spots, so all-PASS is not enough.")
view("approver", "approve", "approver", "The final gate. APPROVE means the branch merges with no human looking.",
     ["approver", "build-md", "review-files", "dod", "policy-check", "ap-rerun", "ap-disprove", "escalate-triggers", "decision-md"],
     [("build-md", "approver", "claims"), ("review-files", "approver", "all PASS"), ("dod", "approver", "ticks"), ("approver", "policy-check", "runs"), ("approver", "ap-rerun", "then"), ("ap-rerun", "ap-disprove", "then"),
      ("escalate-triggers", "approver", "read"), ("approver", "decision-md", "writes")])
for i, (lab, w) in enumerate([("First line", "exactly APPROVE or ESCALATE"), ("Why", "two or three sentences, including what it checked itself"), ("Acceptance criteria", "met or not met, and how it knows"),
                              ("Plan adherence", "whether the diff matches plan.md"), ("Policy check", "the output of policy_check.py, or clean"),
                              ("Merge danger", "door (one-way or two-way), blast radius in one word, before and after evidence"), ("For the human", "only when escalating: the exact decision needed and the files to look at")]):
    d(f"dm-{i}", lab, "board", "section of decision.md", f"{lab}: {w}.", "Every decision." if i != 6 else "Only on ESCALATE.", "Written by the approver and read by the gate and by you.")
view("decision-md", "approve", "decision.md · what is in it", "The gate reads only the first line; people read the rest.", ["decision-md"] + [f"dm-{i}" for i in range(7)], [("decision-md", f"dm-{i}", "") for i in range(7)])
for i, (lab, w) in enumerate([("CI or deploy config", ".github/**, Dockerfile*, deploy*, k8s, terraform"), ("Schema migrations", "any **/migrations/** path"), ("New dependencies", "a manifest or lockfile changed"),
                              ("Money, access, identity", "payments, auth, permissions, security rules"), ("Large change", "over merge_policy.auto_max_lines (400)"), ("Waived intent", "--skip-intent was used"),
                              ("Weakened bar", "a suppression, skipped test or stripped assertion"), ("High-risk spec", "the spec's Risk line is high")]):
    d(f"et-{i}", lab, "hook", "always a person", f"{lab}: {w}.", "At the approver and the gate.", "Even an APPROVE needs a human at the gate when one of these is present.", "factory/policy.json")
view("escalate-triggers", "approve", "Escalate triggers", "What always sends a job to a person, even after APPROVE.", ["escalate-triggers"] + [f"et-{i}" for i in range(8)], [("escalate-triggers", f"et-{i}", "") for i in range(8)])

# ---- gate
for i, (lab, w) in enumerate([("Frozen path edited", "always refused, even with a human"), ("Escalate path touched", "needs a human"), ("Dependency file changed", "needs a human"),
                              ("Over the size cap", "needs a human"), ("Intent waived", "needs a human")]):
    d(f"cp-{i}", lab, "hook", "policy check", f"{lab}: {w}.", "Fourth gate check.", "Read from factory/policy.json by policy_check.py.", "factory/scripts/policy_check.py")
view("check-policy", "gate", "Policy + intent check", "A frozen path is the only thing a human cannot override.", ["check-policy", "policy-json"] + [f"cp-{i}" for i in range(5)],
     [("policy-json", "check-policy", "rules")] + [("check-policy", f"cp-{i}", "") for i in range(5)])
d("tm-copy", "Throwaway copy", "script", "of main as it is now", "A detached worktree of the base branch.", "Every merge.", "Catches a branch that merges cleanly but no longer builds against a base that moved.", "factory/scripts/merge_gate.py")
view("trial-merge", "gate", "Trial merge + proof", "The merged result is built and tested before the real merge.",
     ["tm-copy", "trial-merge", "verify-cmds", "constraints-py", "constraints-json", "real-merge"],
     [("tm-copy", "trial-merge", "merge into"), ("trial-merge", "verify-cmds", "runs"), ("verify-cmds", "constraints-py", "then"), ("constraints-json", "constraints-py", "baseline"), ("constraints-py", "real-merge", "pass")])
d("rm-nopush", "Never pushes", "hook", "local only", "The gate merges locally and cleans up.", "Always.", "A person publishes the result, with the release variable set if they use Claude Code to do it.")
view("real-merge", "gate", "Real merge + cleanup", "Only after proof. Then the record is committed.", ["real-merge", "worktree", "jobctl", "adr-py", "adr-dir", "rm-nopush"],
     [("real-merge", "worktree", "removes"), ("real-merge", "jobctl", "stage = merged"), ("real-merge", "adr-py", "then"), ("adr-py", "adr-dir", "commits"), ("real-merge", "rm-nopush", "")])
for code, w in [("0", "merged"), ("3", "a human must decide"), ("4", "refused"), ("5", "verification or a ratchet failed"), ("6", "another merge holds the lock; run it again"), ("7", "the merge itself failed, for example a conflict")]:
    d(f"ec-{code}", f"exit {code}", "board", w, f"Exit {code}: {w}.", "Every gate run.", "The orchestrator acts on the exit code and prints the gate's JSON.", "factory/scripts/merge_gate.py")
view("exit-codes", "gate", "Gate exit codes", "What each result means and what the orchestrator does.", ["merge-gate"] + [f"ec-{c}" for c in "034567"],
     [("merge-gate", f"ec-{c}", "") for c in "034567"])

# ---- guardrails
KEYS = [("intent_required", "a spec job needs an accepted intent"), ("spec_approval", "human always pauses; auto only for low risk, never a split"), ("max_resumes", "builder resumes after round 1"),
        ("frozen_paths", "agents may never edit these"), ("escalate_paths", "editable, but a human approves the merge"), ("dependency_files", "a change needs a human"),
        ("test_globs", "what counts as a test"), ("blocked_commands", "push, deploy, publish and similar"), ("ticketing", "ticket key pattern and optional MCP server"),
        ("merge_policy", "size cap, verify_commands, constraints, lock timeout"), ("adr", "where merged Design sections are recorded")]
for key, w in KEYS:
    d(f"pk-{key}", key, "board", "policy.json key", f"{key}: {w}.", "Read by the hooks, policy_check and the gate.", "Edited by a person; agents cannot edit factory/policy.json.", "factory/policy.json")
view("policy-json", "guardrails", "policy.json · the rules", "One file read by the hooks, policy_check.py and the gate.", ["policy-json"] + [f"pk-{k}" for k, _ in KEYS],
     [("policy-json", f"pk-{k}", "") for k, _ in KEYS])
d("he-scope", "Only in worktrees", "hook", "never blocks you", "The path rules apply only inside a factory worktree.", "Every edit.", "A person editing the main checkout is never blocked.", ".claude/hooks/factory_hooks.py")
d("he-frozen", "Frozen paths refused", "hook", "write BLOCKED", "An edit to a frozen path is refused.", "Every Edit or Write in a worktree.", "The agent writes BLOCKED and the job goes to needs-human; it never works around a hook.", ".claude/hooks/factory_hooks.py")
view("hook-edits", "guardrails", "Hook: edits", "PreToolUse on Edit, Write, MultiEdit and NotebookEdit.", ["hook-edits", "policy-json", "he-scope", "he-frozen", "test-lock"],
     [("policy-json", "hook-edits", "rules"), ("hook-edits", "he-scope", ""), ("hook-edits", "he-frozen", ""), ("hook-edits", "test-lock", "")])
for i, (lab, w) in enumerate([("Publishing code", "blocked unless a person authorised a release"), ("Deploy and publish", "terraform apply, kubectl, helm, docker push, npm publish"), ("Hand-merging a factory branch", "use merge_gate.py"),
                              ("Secrets in a commit", "common key formats")]):
    d(f"hb-{i}", lab, "hook", "blocked command", f"{lab}: {w}.", "Every Bash call.", "Matched against factory/policy.json blocked_commands.", ".claude/hooks/factory_hooks.py")
d("hb-allowed", "Read-only merge checks", "board", "allowed", "merge-tree and merge-base on a factory branch are allowed.", "The approver's conflict check.", "The pattern uses merge(?![\\w-]) so they are not mistaken for a merge.", "factory/policy.json")
view("hook-bash", "guardrails", "Hook: commands", "PreToolUse on Bash.", ["hook-bash", "hb-0", "hb-1", "hb-2", "hb-3", "hb-allowed", "release-var"],
     [("hook-bash", f"hb-{i}", "blocks") for i in range(4)] + [("hook-bash", "hb-allowed", "allows"), ("release-var", "hb-0", "authorises")])
d("mg-owners", "CODEOWNERS + branch protection", "board", "your repo", "Protect .claude/ and factory/policy.json.", "When you adopt it.", "Hooks in the repo can be edited by anyone with write access; this is the other half of enforcement.")
view("managed-install", "guardrails", "managed/install.py", "An admin step that makes the hooks impossible to disable.", ["managed-install", "policy-json", "hook-edits", "hook-bash", "mg-owners"],
     [("managed-install", "hook-edits", "installs"), ("managed-install", "hook-bash", "installs"), ("managed-install", "policy-json", "copies"), ("mg-owners", "policy-json", "protects")])

# ---- split
view("slice", "split", "A slice (child job)", "Created by the split, specced late, gated by its dependencies.", ["slice", "intent-inherit", "dep-check", "cmd-ready", "parent-close", "jobctl"],
     [("jobctl", "slice", "creates"), ("intent-inherit", "slice", "intent"), ("cmd-ready", "slice", "starts"), ("dep-check", "slice", "refuses early"), ("slice", "parent-close", "all merged")])

# ---- parallel
view("session", "parallel", "A session = a job", "Open one Claude Code session per job in the same repo.", ["session", "claim-number", "jobctl", "worktree", "ports"],
     [("session", "claim-number", "claims"), ("claim-number", "jobctl", "number"), ("jobctl", "worktree", "creates"), ("session", "ports", "gets")])
for i, (lab, w) in enumerate([("builder", "5100 + 10n"), ("reviewer-ux", "5101 + 10n"), ("reviewer-ui", "5102 + 10n")]):
    d(f"pt-{i}", f"{lab} port", "board", w, f"{lab} uses {w}, where n is the job number.", "Each job.", "Each also gets its own agent-browser session, named <job-id>-<role>.")
view("ports", "parallel", "Ports + browser sessions", "So reviewers of different jobs never see each other's pages.", ["ports", "pt-0", "pt-1", "pt-2", "agent-browser"],
     [("ports", "pt-0", ""), ("ports", "pt-1", ""), ("ports", "pt-2", ""), ("pt-1", "agent-browser", "own session"), ("pt-2", "agent-browser", "own session")])
d("ml-exit", "exit 6", "board", "run it again", "Another merge holds the lock.", "Two jobs finish together.", "Wait a minute and run the gate again.")
view("merge-lock", "parallel", "Merge lock", "Merges are serialised.", ["merge-lock", "merge-gate", "check-clean", "ml-exit"], [("merge-gate", "merge-lock", "takes"), ("merge-lock", "check-clean", "then"), ("merge-lock", "ml-exit", "if held")])

# ---- maintain
for cid, lab, w in [("cl-cmd", "A command", "prints a number"), ("cl-http", "An HTTP JSON endpoint", "secrets read from environment variables"), ("cl-log", "A log file", "its error rate"),
                    ("cl-git", "git", "commits or reverts per day"), ("cl-factory", "The factory itself", "its own cycle time")]:
    d(cid, lab, "script", "collector", f"Collector: {lab.lower()}, {w}.", "Each collect run.", "Enable the entries in collectors.json that point at your service.", "factory/maintain/collectors.json")
view("collect-py", "maintain", "collect.py · where metrics come from", "Real values appended to factory/maintain/metrics/.", ["collect-py", "collectors-json", "cl-cmd", "cl-http", "cl-log", "cl-git", "cl-factory"],
     [("collectors-json", "collect-py", "config")] + [("collect-py", c, "") for c in ["cl-cmd", "cl-http", "cl-log", "cl-git", "cl-factory"]])
for i, (lab, w) in enumerate([("1 sigma", "logged"), ("2 sigma", "diagnosed by the diagnoser"), ("3 sigma", "acted on: an incident and an intent")]):
    d(f"bd-{i}", lab, "board", "band", f"{lab}: {w}.", "Each detect run.", "Measured against that metric's own baseline; a dismissal widens it.", "factory/maintain/bands.json")
view("detect-py", "maintain", "detect.py · plain statistics", "Repeatable; the model is not involved.", ["detect-py", "bd-0", "bd-1", "bd-2", "dismiss-py"],
     [("detect-py", "bd-0", ""), ("detect-py", "bd-1", ""), ("detect-py", "bd-2", ""), ("dismiss-py", "detect-py", "widens")])
d("dg-measure", "Check the measurement", "hook", "before blaming a change", "Confirms the metric measures what the band assumes.", "Every diagnosis.", "Looks at how it is computed, whether its definition, unit or window changed, and whether the baseline period is comparable.", ".claude/agents/diagnoser.md")
d("dg-hyp", "Competing hypotheses", "board", "2 or 3", "Candidate causes, each with what would confirm and what would rule it out.", "Every diagnosis.", "Keeps the ones it could not rule out and says which check would separate them.", ".claude/agents/diagnoser.md")
d("diagnosis-md", "diagnosis.md", "board", "LIKELY-CAUSE | INCONCLUSIVE", "Evidence, likely cause, confidence, one suggested next step.", "After a breach.", "A person decides; it never suggests a rollback as the default.", "factory/maintain/")
view("diagnoser", "maintain", "diagnoser", "Read-only; never changes a system.", ["detect-py", "diagnoser", "dg-measure", "dg-hyp", "diagnosis-md", "incident-md"],
     [("detect-py", "diagnoser", "breach"), ("diagnoser", "dg-measure", "first"), ("dg-measure", "dg-hyp", "then"), ("dg-hyp", "diagnosis-md", "writes"), ("diagnosis-md", "incident-md", "at 3 sigma")])
d("lens-secrets", "Secrets lens", "script", "no model", "Looks for secrets in files and git history.", "Each scan.", "Plain code.", "factory/maintain/scan_lenses.py")
d("lens-deps", "Dependencies lens", "script", "no model", "Looks at dependency manifests.", "Each scan.", "Plain code.", "factory/maintain/scan_lenses.py")
view("scan-py", "maintain", "scan.py · four lenses", "Security and quality use agents; secrets and dependencies need no model. Every finding is verified against the repo.",
     ["scan-py", "scanner-security", "scanner-quality", "lens-secrets", "lens-deps", "findings", "triage"],
     [("scan-py", "scanner-security", "security"), ("scan-py", "scanner-quality", "quality"), ("scan-py", "lens-secrets", "secrets"), ("scan-py", "lens-deps", "dependencies"),
      ("scanner-security", "findings", "verified"), ("scanner-quality", "findings", "verified"), ("lens-secrets", "findings", ""), ("lens-deps", "findings", ""), ("findings", "triage", "you decide")])
view("triage", "maintain", "triage", "Accept a finding into the backlog, or dismiss it with a reason.", ["findings", "triage", "backlog", "dismiss-py", "cmd-next"],
     [("findings", "triage", ""), ("triage", "backlog", "accept"), ("triage", "dismiss-py", "dismiss"), ("backlog", "cmd-next", "/factory next")])

# ---- dashboard
for cid, lab, w in [("db-cols", "Columns", "Intent, Spec, Approve spec, Plan, Build, Review, Approve, Merged, Needs human, and Split when used"),
                    ("db-cards", "Cards", "feature, branch, review chips per round, tags such as paused or waits on, and the command you should run"),
                    ("db-drawer", "Drawer", "click a card to read each job file, coloured by its first line")]:
    d(cid, lab, "board", "dashboard.html", f"{lab}: {w}.", "While jobs run.", "No build step and no dependencies.", "factory/dashboard.html")
d("db-poll", "Polls jobs/", "script", "every 2 seconds", "Reads each job.json and its round folders.", "While the page is open.", "Each orchestrator session writes only its own job.json, so sessions never collide.", "factory/dashboard.html")
view("dashboard-html", "dashboard", "dashboard.html", "cd factory && python3 -m http.server, then open /dashboard.html.", ["dashboard-html", "db-poll", "job-json", "db-cols", "db-cards", "db-drawer"],
     [("job-json", "db-poll", "read"), ("dashboard-html", "db-poll", "polls"), ("dashboard-html", "db-cols", ""), ("dashboard-html", "db-cards", ""), ("dashboard-html", "db-drawer", "")])
for cid, lab in [("mt-cycle", "Median cycle time"), ("mt-first", "First-pass rate"), ("mt-rounds", "Average review rounds"), ("mt-esc", "Escalation rate")]:
    d(cid, lab, "board", "/factory metrics", f"{lab}, from the job history.", "At /factory metrics.", "Computed from job.json timestamps; nothing else is stored.", "factory/scripts/metrics.py")
d("ls-group", "Group findings", "script", "word overlap", "Groups CHANGES findings that say nearly the same thing.", "At /factory lessons.", "Needs the same finding in at least two jobs; read the groups yourself.", "factory/scripts/lessons.py")
d("ls-hint", "Fix level", "board", "strongest first", "Architecture, types, a lint, a test, and only then a written rule.", "Per group.", "A suppression points at the existing weakened-bar scan; missing validation points at a boundary test or a type.", "factory/scripts/lessons.py")

# ---- evals
for cid, lab in [("ev-config", "Config"), ("ev-hooks", "Hooks"), ("ev-managed", "Managed settings"), ("ev-maintain", "Maintain loop"), ("ev-scan", "Scan lenses"),
                 ("ev-gate", "Merge gate"), ("ev-scripts", "Scripts"), ("ev-artifacts", "Artifact formats")]:
    d(cid, lab, "board", "offline checks", f"Offline checks for: {lab.lower()}.", "run_evals.py.", "No model; mutation-tested where it matters.", "factory/evals/run_evals.py")
view("run-evals", "evals", "run_evals.py · offline", "326 checks with no model. Needs Python 3.12 or newer.", ["run-evals", "python312", "ev-config", "ev-hooks", "ev-managed", "ev-maintain", "ev-scan", "ev-gate", "ev-scripts", "ev-artifacts"],
     [("run-evals", "python312", "needs")] + [("run-evals", c, "") for c in ["ev-config", "ev-hooks", "ev-managed", "ev-maintain", "ev-scan", "ev-gate", "ev-scripts", "ev-artifacts"]])
for cid, lab in [("ae-loop", "Intent, spec, planner"), ("ae-review", "Reviewers"), ("ae-approve", "Approver"), ("ae-diag", "Diagnoser"), ("ae-onb", "Onboarder"), ("ae-scan", "Scanner"), ("ae-pr", "pr-reviewer"), ("ae-build", "Builder")]:
    d(cid, lab, "board", "live cases", f"Live agent cases: {lab}.", "agent_evals.py.", "Each runs the agent on a fixture repo and checks its output file mechanically.", "factory/evals/agent_evals.py")
view("agent-evals", "evals", "agent_evals.py · live", "17 cases, about 15 minutes of subscription use. One failure can be a flake: re-run it once.", ["agent-evals", "ae-loop", "ae-review", "ae-approve", "ae-diag", "ae-onb", "ae-scan", "ae-pr", "ae-build"],
     [("agent-evals", c, "") for c in ["ae-loop", "ae-review", "ae-approve", "ae-diag", "ae-onb", "ae-scan", "ae-pr", "ae-build"]])
for cid, lab, w in [("e2e-natural", "Natural jobs", "intent to merge in round 1"), ("e2e-escalate", "Escalate + rework", "a CI workflow: ESCALATE, human rework, round 2, human approve"), ("e2e-split", "A split job", "three dependent children, ADRs, the parent closing"),
                    ("e2e-changes", "A CHANGES round", "a fault-injected defect caught by two reviewers, fixed, merged"), ("e2e-ui", "UI jobs", "reviewers open the page with agent-browser")]:
    d(cid, lab, "board", "end-to-end run", f"{lab}: {w}.", "Recorded in AUDIT.md.", "Run on a fixture repo with nested claude -p sessions in auto mode.", "AUDIT.md")
view("e2e", "evals", "End-to-end runs", "What has run for real, and what the defects it found were. AUDIT.md has the detail.", ["e2e", "e2e-natural", "e2e-escalate", "e2e-split", "e2e-changes", "e2e-ui", "audit-md"],
     [("e2e", c, "") for c in ["e2e-natural", "e2e-escalate", "e2e-split", "e2e-changes", "e2e-ui"]] + [("e2e", "audit-md", "recorded in")])

# ---- install
for cid, lab, w in [("dc-agents", "AGENTS.md covers the basics", "setup, tests, build or lint, dev server and port, layout, conventions, what not to touch"), ("dc-policy", "Policy is valid", "frozen, escalate and blocked lists, intent_required"),
                    ("dc-hooks", "Hooks are wired", "settings.json calls the factory hooks"), ("dc-skills", "Helper skills installed", "tdd, diagnosing-bugs, codebase-design, code-review, grilling"),
                    ("dc-verify", "verify-app exists", "when the app has a dev server")]:
    d(cid, lab, "hook", "doctor check", f"{lab}: {w}.", "/factory doctor.", "PASS, WARN or FAIL; a FAIL means jobs will misbehave.", "factory/scripts/doctor.py")
view("policy-edit", "install", "Make the policy yours", "The keys most repos change first.", ["policy-edit", "pk-escalate_paths", "pk-frozen_paths", "pk-test_globs", "pk-merge_policy", "pk-blocked_commands"],
     [("policy-edit", c, "") for c in ["pk-escalate_paths", "pk-frozen_paths", "pk-test_globs", "pk-merge_policy", "pk-blocked_commands"]])
view("install-helpers", "install", "Helper skills", "Five MIT skills pinned to one commit. Read them first: they become instructions your agents follow.", ["install-helpers", "tdd", "diagnosing-bugs", "codebase-design", "code-review", "grilling"],
     [("install-helpers", c, "installs") for c in ["tdd", "diagnosing-bugs", "codebase-design", "code-review", "grilling"]])

# ====================================================================== Commands: one view per /factory command
CMDS = ["cmd-feature", "cmd-intent", "cmd-accept", "cmd-approve-spec", "cmd-respec", "cmd-approve", "cmd-rework", "cmd-next", "cmd-ready", "cmd-stop", "cmd-metrics", "cmd-lessons", "cmd-review", "cmd-doctor", "cmd-init", "cmd-maintain"]
n("cmd-feature", "/factory <feature>", "public", "Runs a new job.", "You have a feature to build.",
  "Because intent is required, it starts at /factory intent and stops for you. Flags: --ticket KEY, --type bugfix, and a person's --skip-intent \"reason\".", ".claude/skills/factory/SKILL.md",
  sub="[--ticket KEY] [--type bugfix]", verbs=["--ticket", "--type bugfix", "--skip-intent"])
n("commands", "Commands", "lane", "All sixteen /factory commands.", "Whenever you want to know what to type.",
  "Each command opens its own view: what it runs, which agents, scripts and files it touches, and where it stops for you.", ".claude/skills/factory/SKILL.md", sub="all 16 /factory commands", opens="commands")

view("commands", "root", "Commands · everything you can type", "Three starts a job, two decide, the rest queue, look, set up and watch. Open one for what it runs.",
     CMDS,
     [("cmd-feature", "cmd-intent", "by default"), ("cmd-intent", "cmd-accept", "you accept"), ("cmd-accept", "cmd-approve-spec", "you approve"), ("cmd-approve-spec", "cmd-approve", "if ESCALATE"), ("cmd-approve", "cmd-rework", "or send back")],
     containers=[{"id": "start", "label": "Start and steer a job", "nodeIds": ["cmd-feature", "cmd-intent", "cmd-accept", "cmd-approve-spec", "cmd-respec"]},
                 {"id": "decide", "label": "Decide", "nodeIds": ["cmd-approve", "cmd-rework"]},
                 {"id": "pace", "label": "Queue and pace", "nodeIds": ["cmd-next", "cmd-ready", "cmd-stop"]},
                 {"id": "look", "label": "Look and learn", "nodeIds": ["cmd-metrics", "cmd-lessons", "cmd-review"]},
                 {"id": "setup", "label": "Set up and watch", "nodeIds": ["cmd-doctor", "cmd-init", "cmd-maintain"]}])

view("cmd-feature", "commands", "/factory <feature>", "Runs a new job. Intent is required, so it starts at intent; only a person can waive that.",
     ["cmd-feature", "cmd-intent", "skip-intent", "flag-ticket", "flag-bugfix", "red-commit", "test-lock", "jobctl"],
     [("cmd-feature", "cmd-intent", "by default"), ("cmd-feature", "skip-intent", "only a person"), ("skip-intent", "jobctl", "waiver recorded"), ("cmd-intent", "jobctl", "creates"),
      ("cmd-feature", "flag-ticket", "--ticket"), ("cmd-feature", "flag-bugfix", "--type"), ("flag-bugfix", "red-commit", "first"), ("red-commit", "test-lock", "then lock")])
view("cmd-intent", "commands", "/factory intent", "Writes intent.md and stops. You answer the open questions, then accept.",
     ["cmd-intent", "jobctl", "intent-writer", "out-of-scope", "glossary", "intent-md", "open-questions"],
     [("cmd-intent", "jobctl", "creates the job"), ("jobctl", "intent-writer", "spawns"), ("out-of-scope", "intent-writer", "read"), ("glossary", "intent-writer", "read"), ("intent-writer", "intent-md", "writes"), ("intent-md", "open-questions", "has")])
view("cmd-accept", "commands", "/factory accept", "You answer, the intent is rewritten, the worktree is created and the spec starts.",
     ["intent-md", "grilling", "cmd-accept", "jobctl", "worktree", "spec-writer"],
     [("intent-md", "grilling", "unanswered"), ("grilling", "cmd-accept", "answers"), ("cmd-accept", "jobctl", "stage = spec"), ("cmd-accept", "worktree", "creates"), ("cmd-accept", "spec-writer", "spawns")])
view("cmd-approve-spec", "commands", "/factory approve-spec", "Approval is recorded, then the job goes to planning, or to the split step when the spec has a Split section.",
     ["spec-md", "cmd-approve-spec", "spec-approval", "policy-json", "planner", "split"],
     [("spec-md", "cmd-approve-spec", "you approve"), ("cmd-approve-spec", "spec-approval", "records"), ("policy-json", "cmd-approve-spec", "spec_approval"), ("cmd-approve-spec", "planner", "starts"), ("cmd-approve-spec", "split", "if Split")])
view("cmd-respec", "commands", "/factory respec", "Sends the spec back with your note, saved verbatim.", ["spec-md", "cmd-respec", "spec-feedback", "jobctl", "spec-writer"],
     [("spec-md", "cmd-respec", "not yet"), ("cmd-respec", "spec-feedback", "saves"), ("cmd-respec", "jobctl", "bump respecs"), ("spec-feedback", "spec-writer", "address"), ("spec-writer", "spec-md", "revises")])
view("cmd-approve", "commands", "/factory approve", "Merges a needs-human job as it is. Only this command lets the gate use the human-approved flag.",
     ["decision-md", "cmd-approve", "human-approval", "snapshot-audit", "merge-gate", "real-merge"],
     [("decision-md", "cmd-approve", "ESCALATE"), ("cmd-approve", "human-approval", "records"), ("cmd-approve", "snapshot-audit", "commits"), ("cmd-approve", "merge-gate", "human-approved"), ("merge-gate", "real-merge", "then")])
view("cmd-rework", "commands", "/factory rework", "Sends a needs-human job back to the builder with a fresh resume budget.",
     ["decision-md", "cmd-rework", "rework-md", "jobctl", "builder", "build-md"],
     [("decision-md", "cmd-rework", "ESCALATE"), ("cmd-rework", "rework-md", "saves"), ("cmd-rework", "jobctl", "stage = build"), ("cmd-rework", "builder", "fresh builder"), ("builder", "build-md", "round N+1")])
view("cmd-next", "commands", "/factory next", "Runs the first unchecked backlog item, so two sessions never take the same one.",
     ["backlog", "cmd-next", "claim-line", "cmd-feature"], [("backlog", "cmd-next", "first unchecked"), ("cmd-next", "claim-line", "claims"), ("claim-line", "backlog", "marks claimed"), ("cmd-next", "cmd-feature", "runs it")])
view("cmd-ready", "commands", "/factory ready", "Starts the split children whose dependencies have merged, and closes a parent whose children all merged.",
     ["cmd-ready", "jobctl", "slice", "worktree", "spec-writer", "parent-close"],
     [("cmd-ready", "jobctl", "ready --close-parents"), ("jobctl", "slice", "which are ready"), ("cmd-ready", "worktree", "creates"), ("cmd-ready", "spec-writer", "specs the child"), ("slice", "parent-close", "all merged")])
view("cmd-stop", "commands", "/factory stop | resume", "Stop pauses the next stage; resume continues from the job files.",
     ["cmd-stop", "st-pause", "job-json", "st-resume", "st-gate", "st-limit"],
     [("cmd-stop", "st-pause", "pause each job"), ("st-pause", "job-json", "writes"), ("job-json", "st-resume", "resume_at_stage"), ("st-pause", "st-gate", ""), ("cmd-stop", "st-limit", "")])
view("cmd-metrics", "commands", "/factory metrics", "Everything comes from the job files.", ["cmd-metrics", "metrics-py", "job-json", "mt-cycle", "mt-first", "mt-rounds", "mt-esc"],
     [("cmd-metrics", "metrics-py", "runs"), ("job-json", "metrics-py", "read")] + [("metrics-py", c, "") for c in ["mt-cycle", "mt-first", "mt-rounds", "mt-esc"]])
view("cmd-lessons", "commands", "/factory lessons", "Turns repeated mistakes into checks. You decide what to build.", ["cmd-lessons", "lessons-py", "review-files", "ls-group", "ls-hint"],
     [("cmd-lessons", "lessons-py", "runs"), ("review-files", "lessons-py", "CHANGES reviews"), ("lessons-py", "ls-group", ""), ("ls-group", "ls-hint", "suggests")])
d("pr-drop", "Comments off the diff", "hook", "dropped by a script", "A comment whose file, line or quoted code is not in the diff is dropped.", "Every review_branch run.", "So an invented comment cannot reach a pull request.", "factory/scripts/review_branch.py")
d("gh-script", "gh-review.sh", "board", "you run it", "For a pull request, the commands to post the review.", "After you read review.md.", "Nothing is ever posted for you.")
view("cmd-review", "commands", "/factory review", "Reviews any branch or pull request; read-only.", ["cmd-review", "review-branch", "pr-reviewer", "review-md", "code-review", "pr-drop", "gh-script"],
     [("cmd-review", "review-branch", "runs"), ("review-branch", "pr-reviewer", "spawns"), ("review-md", "pr-reviewer", "rules"), ("code-review", "pr-reviewer", "axes"), ("pr-reviewer", "pr-drop", "then"), ("pr-drop", "gh-script", "writes")])
view("cmd-doctor", "commands", "/factory doctor", "Fix every FAIL before the first job.", ["cmd-doctor", "doctor-py", "dc-agents", "dc-policy", "dc-hooks", "dc-skills", "dc-verify"],
     [("cmd-doctor", "doctor-py", "runs")] + [("doctor-py", c, "") for c in ["dc-agents", "dc-policy", "dc-hooks", "dc-skills", "dc-verify"]])
d("verify-proposed", "VERIFY.proposed.md", "board", "a draft, not installed", "A draft verify-app skill from the onboarder.", "For a repo with a runnable app.", "You read it, fix every UNKNOWN, and move it to .claude/skills/verify-app/SKILL.md yourself, because .claude/ is frozen.")
view("cmd-init", "commands", "/factory init", "Drafts the project doc; it runs read-only commands only.", ["cmd-init", "onboarder", "agents-md", "verify-proposed", "verify-app", "doctor-py"],
     [("cmd-init", "onboarder", "spawns"), ("onboarder", "agents-md", "drafts"), ("onboarder", "verify-proposed", "drafts"), ("verify-proposed", "verify-app", "you install"), ("doctor-py", "agents-md", "checks")])
view("cmd-maintain", "commands", "/factory maintain collect | schedule | run | scan | triage", "Watches the running product and the repo. It never merges, deploys or pushes.",
     ["cmd-maintain", "collect-py", "detect-py", "diagnoser", "scan-py", "triage", "schedule-py"],
     [("cmd-maintain", "collect-py", "collect"), ("cmd-maintain", "detect-py", "run"), ("cmd-maintain", "scan-py", "scan"), ("cmd-maintain", "triage", "triage"), ("cmd-maintain", "schedule-py", "schedule"), ("detect-py", "diagnoser", "breach")])

# Explicit [column, row] positions where the automatic layout overlaps families or detours.
LAYOUTS = {
    "root": {"intake": [0, 0], "spec": [1, 0], "plan": [2, 0], "build": [3, 0], "review": [4, 0], "approve": [5, 0], "gate": [6, 0],
             "commands": [0, 3], "install": [1, 3], "agents": [2, 3], "guardrails": [3, 3], "split": [4, 3],
             "parallel": [0, 4], "maintain": [1, 4], "dashboard": [2, 4], "evals": [3, 4]},
    "agents": {"intent-writer": [0, 0], "spec-writer": [1, 0], "planner": [2, 0], "builder": [3, 0], "approver": [5, 0],
               "reviewer-security": [1, 3], "reviewer-ux": [2, 3], "reviewer-ui": [3, 3], "reviewer-code": [4, 3],
               "onboarder": [0, 6], "pr-reviewer": [1, 6], "diagnoser": [3, 6], "scanner-security": [4, 6], "scanner-quality": [5, 6]},
    "dashboard": {"jobctl": [0, 0], "job-json": [1, 0], "dashboard-html": [2, 0], "metrics-py": [2, 2], "lessons-py": [2, 3],
                  "cmd-metrics": [1, 2], "cmd-lessons": [1, 3]},
    "commands": {"cmd-feature": [0, 0], "cmd-intent": [1, 0], "cmd-accept": [2, 0], "cmd-approve-spec": [3, 0], "cmd-respec": [4, 0],
                 "cmd-next": [0, 3], "cmd-ready": [1, 3], "cmd-stop": [2, 3], "cmd-approve": [4, 3], "cmd-rework": [5, 3],
                 "cmd-metrics": [0, 6], "cmd-lessons": [1, 6], "cmd-review": [2, 6], "cmd-doctor": [3, 6], "cmd-init": [4, 6], "cmd-maintain": [5, 6]},
    "review": {"checklists": [0, 0], "verify-app": [0, 1], "review-md": [0, 3], "code-review": [0, 4], "dod": [0, 5],
               "reviewer-security": [1, 0], "reviewer-ux": [1, 1], "reviewer-ui": [1, 2], "reviewer-code": [1, 3],
               "agent-browser": [2, 1], "review-files": [3, 2]},
}

def main():
    root = next(v for v in VIEWS if v['id'] == 'root')
    root['nodes'] = []
    for sid in JOB:
        nd = NODES.pop(sid)
        nd['kind'] = 'step'
        root['nodes'].append(nd)
    for v in VIEWS:
        if v['id'] in LAYOUTS:
            v['layout'] = LAYOUTS[v['id']]
    ids = set(NODES)
    for v in VIEWS:
        vs = set(v["nodeIds"])
        local = {x["id"] for x in v.get("nodes", [])}
        for i in v["nodeIds"]:
            assert i in ids or i in local, f"view {v['id']}: unknown node {i}"
        for e in v["edges"]:
            assert e["from"] in vs and e["to"] in vs, f"view {v['id']}: edge {e} outside its nodes"
        for nid in v["nodeIds"]:
            pass
    for nd in NODES.values():
        o = nd.get("opensView")
        assert not o or any(v["id"] == o for v in VIEWS), f"{nd['id']} opens unknown view {o}"
    data = {
        "title": "Forgeline map",
        "root": "root",
        "pack": "software-factory-plus",
        "branch": "main",
        "sourcesBase": "",
        "version": "0.1",
        "kinds": {
            "public": "a command you type, or a session you start",
            "lane": "a stage or agent the factory runs on its own",
            "external": "a skill or tool from outside this repo (the origin says where)",
            "script": "plain code, no model",
            "hook": "a guard that fires on its own",
            "board": "state: files, policy and worktrees",
        },
        "authors": {
            "mattpocock": {"name": "Matt Pocock", "url": "https://github.com/mattpocock"},
            "vercel-labs": {"name": "Vercel Labs", "url": "https://github.com/vercel-labs"},
        },
        "notes": ["Written from USAGE.md and the factory skill. Source paths are repo-root-relative."],
        "nodes": list(NODES.values()),
        "edges": [],
        "views": VIEWS,
    }
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print(OUT, len(NODES) + len(JOB), "nodes", len(VIEWS), "views", sum(len(v["edges"]) for v in VIEWS), "edges")


if __name__ == "__main__":
    sys.exit(main())
