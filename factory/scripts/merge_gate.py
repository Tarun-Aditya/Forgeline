#!/usr/bin/env python3
"""The only way a factory job reaches main.

  merge_gate.py <job-id> [--human-approved] [--dry-run] [--factory factory] [--base BRANCH] [--lock-wait SECONDS]

Exit codes:  0 merged   3 a human must decide   4 refused   5 verification failed
             6 another merge holds the lock   7 the merge itself failed

What it checks, in order, all inside one lock so nothing can move between the proof
and the merge:
  1. Main checkout is on the base branch and clean (backlog.md excepted).
  2. The job is at stage approve or needs-human, and has a decision.md. APPROVE is
     enough on its own; ESCALATE merges only with --human-approved, which the
     orchestrator passes only when the user ran /factory approve.
  3. The approval is bound to a commit: job.reviewed_sha must equal the branch head,
     or every later commit must touch only factory/audit/<job-id>/. A commit made
     after the review invalidates the approval.
  4. policy_check.py: a VIOLATION always refuses, even with a human. Escalate paths,
     dependency manifests and a change over merge_policy.auto_max_lines need a human
     even if the approver said APPROVE.
  5. Intent: with policy.intent_required, the job needs intent.md; a waived intent
     needs a human.
  6. The branch is merged into a throwaway copy of the base as it is right now, and
     merge_policy.verify_commands run there. This catches a branch that merges
     cleanly but no longer builds against a base that moved after it was tested.
     merge_policy.constraints (see constraints.py) are measured there too and must not
     fall below the baselines in factory/constraints.json of the base checkout.
  7. Only then the real merge (--no-ff), then the worktree and branch are removed, and a
     spec's accepted Design section is committed as an ADR (policy.adr.dir, see adr.py).
Nothing here pushes.
"""

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from factory_lib import any_match, base_branch, load_policy  # noqa: E402
import worktree_setup  # noqa: E402
import constraints as ratchets  # noqa: E402
import monorepo  # noqa: E402
import callers as callers_mod  # noqa: E402
import adr as adr_record  # noqa: E402


def git(repo, *args, check=False):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=check)


def run_cmd(cmd, cwd, minutes=30):
    """Run one policy command through the shell, so `a && b`, pipes and VAR=x work."""
    try:
        return subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, check=False, timeout=minutes * 60)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(cmd, 124, "", f"timed out after {minutes} minutes")


def verify_plan(repo, trial, base, base_head, branch, pkgs, mp, policy):
    """The commands to run, as (command, folder-or-None), plus notes and packages with no command.

    The root verify_commands always run. In a monorepo, each package the change touches, each
    package that depends on one it touches, and each package that mentions a symbol the change
    removed or edited also runs its own verify_commands in its own folder.
    """
    plan = [(c, None) for c in mp.get("verify_commands") or []]
    notes, unverified = [], []
    if not pkgs:
        return plan, notes, unverified
    sc = monorepo.scope(monorepo.changed_files(repo, base_head, branch), pkgs)
    affected = set(sc["affected"])
    if mp.get("callers_widen", True) and not sc["root_change"]:
        try:
            rep = callers_mod.report(trial, base_head, f"{branch}", policy=policy)
            extra = set(rep["packages"]) - affected
            if extra:
                notes.append("callers of changed code live in " + ", ".join(sorted(extra)) + ": their tests run too")
            affected |= monorepo.dependents(extra, pkgs)
        except (OSError, ValueError):
            notes.append("callers search failed; only the touched packages and their dependents were tested")
    if sc["root_change"]:
        notes.append("a file outside every package changed (" + sc["root_change"][0] + "): every package is tested")
    for p in pkgs:
        if p["name"] not in affected:
            continue
        if not p["verify_commands"]:
            unverified.append(p["name"])
            continue
        plan += [(c, p["path"]) for c in p["verify_commands"]]
    if unverified:
        notes.append("NO VERIFY for package(s): " + ", ".join(unverified))
    notes.append(f"verified {len(affected)} of {len(pkgs)} packages: " + ", ".join(sorted(affected)))
    return plan, notes, unverified


def out(code, status, **kw):
    print(json.dumps(dict(status=status, **kw), indent=2))
    sys.exit(code)


class Lock:
    def __init__(self, repo, stale_minutes, wait):
        common = git(repo, "rev-parse", "--git-common-dir").stdout.strip()
        self.path = os.path.join(repo, common) if not os.path.isabs(common) else common
        self.path = os.path.join(self.path, "factory-merge.lock")
        self.stale = stale_minutes * 60
        self.wait = wait

    def __enter__(self):
        deadline = time.time() + self.wait
        while True:
            try:
                os.mkdir(self.path)
                with open(os.path.join(self.path, "owner"), "w") as fh:
                    fh.write(f"{os.getpid()} {int(time.time())}\n")
                return self
            except FileExistsError:
                try:
                    pid, ts = open(os.path.join(self.path, "owner")).read().split()
                    dead = False
                    try:
                        os.kill(int(pid), 0)
                    except ProcessLookupError:
                        dead = True
                    except PermissionError:
                        pass
                    if dead or time.time() - int(ts) > self.stale:
                        shutil.rmtree(self.path, ignore_errors=True)
                        continue
                except (OSError, ValueError):
                    pass
                if time.time() >= deadline:
                    out(6, "busy", reason="another merge holds factory-merge.lock", lock=self.path)
                time.sleep(0.5)

    def __exit__(self, *exc):
        shutil.rmtree(self.path, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("job_id")
    ap.add_argument("--factory", default="factory")
    ap.add_argument("--base", default=None, help="default: policy.base_branch, else the repo's main/master")
    ap.add_argument("--human-approved", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--lock-wait", type=int, default=0)
    args = ap.parse_args()

    factory = os.path.abspath(args.factory)
    repo = os.path.dirname(factory)
    jpath = os.path.join(factory, "jobs", args.job_id, "job.json")
    if not os.path.isfile(jpath):
        out(4, "refused", reason=f"no such job {args.job_id}")
    job = json.load(open(jpath, encoding="utf-8"))
    policy = load_policy(os.path.join(factory, "policy.json"))
    mp = policy.get("merge_policy") or {}
    branch = job["branch"]
    args.base = args.base or base_branch(repo, policy)
    audit_prefix = f"factory/audit/{args.job_id}/"
    needs_human, refusals, notes = [], [], []

    with Lock(repo, mp.get("lock_stale_minutes", 60), args.lock_wait):
        # 1. main checkout
        if git(repo, "branch", "--show-current").stdout.strip() != args.base:
            out(4, "refused", reason=f"main checkout is not on {args.base}")
        dirty = [l for l in git(repo, "status", "--porcelain", "--untracked-files=no", "--", ".", ":!factory/backlog.md").stdout.splitlines()
                 if not l[3:].startswith("factory/jobs/")]
        if dirty:
            out(4, "refused", reason="main checkout has uncommitted changes", files=dirty[:5])
        if git(repo, "rev-parse", "--verify", branch).returncode != 0:
            out(4, "refused", reason=f"branch {branch} does not exist")

        # 2. decision
        if job["stage"] not in ("approve", "needs-human"):
            out(4, "refused", reason=f"job is at stage {job['stage']}, not approve or needs-human")
        if job.get("paused"):
            out(4, "refused", reason="job is paused; /factory resume it first")
        dpath = os.path.join(factory, "jobs", args.job_id, "decision.md")
        first = open(dpath, encoding="utf-8").readline().strip() if os.path.isfile(dpath) else ""
        human_ok = args.human_approved and os.path.isfile(os.path.join(factory, "jobs", args.job_id, "human-approval.md"))
        if args.human_approved and not human_ok:
            refusals.append("--human-approved needs human-approval.md in the job folder")
        if first == "ESCALATE" and not human_ok:
            needs_human.append("the approver escalated this job")
        elif first not in ("APPROVE", "ESCALATE"):
            refusals.append("decision.md is missing or does not start with APPROVE or ESCALATE")

        # 3. head binding
        head = git(repo, "rev-parse", branch).stdout.strip()
        pinned = job.get("reviewed_sha")
        if not pinned:
            refusals.append("no reviewed_sha: the approval is not bound to a commit")
        elif pinned != head:
            later = git(repo, "diff", "--name-only", f"{pinned}..{head}")
            if git(repo, "merge-base", "--is-ancestor", pinned, head).returncode != 0 or later.returncode != 0:
                refusals.append("the branch no longer descends from the reviewed commit")
            else:
                extra = [f for f in later.stdout.splitlines() if not f.startswith(audit_prefix)]
                if extra:
                    refusals.append(f"commits after the review changed {len(extra)} file(s) outside the audit record, "
                                    f"e.g. {extra[0]}; review again")

        # 4. policy
        pc = subprocess.run([sys.executable, "-I", os.path.join(HERE, "policy_check.py"), repo, branch,
                             "--base", args.base, "--policy", os.path.join(factory, "policy.json")],
                            capture_output=True, text=True, check=False)
        for line in pc.stdout.splitlines():
            if line.startswith("VIOLATION") or line.startswith("ERROR"):
                refusals.append(line)
            elif line.startswith("ESCALATE-TRIGGER") and not human_ok:
                needs_human.append(line)

        # 5. intent
        if policy.get("intent_required"):
            if job.get("intent_waived"):
                if not human_ok:
                    needs_human.append(f"intent was waived: {job['intent_waived']}")
            elif not os.path.isfile(os.path.join(factory, "jobs", args.job_id, "intent.md")):
                refusals.append("intent_required is on and the job has no intent.md")

        # 5b. a split job waits for the jobs it depends on
        for dep in job.get("depends_on") or []:
            try:
                with open(os.path.join(factory, "jobs", dep, "job.json"), encoding="utf-8") as fh:
                    dep_stage = json.load(fh).get("stage")
            except (OSError, ValueError):
                dep_stage = "missing"
            if dep_stage != "merged":
                refusals.append(f"depends on {dep}, which is {dep_stage}, not merged")

        if refusals:
            out(4, "refused", reasons=refusals)
        if needs_human:
            out(3, "needs-human", reasons=sorted(set(needs_human)))

        # 6. verify against the base as it is now
        base_head = git(repo, "rev-parse", args.base).stdout.strip()
        tmp = tempfile.mkdtemp(prefix="factory-gate-")
        trial = os.path.join(tmp, "trial")
        try:
            made = git(repo, "worktree", "add", "--detach", trial, base_head)
            if made.returncode != 0:
                out(7, "merge-failed", reason="could not create the verification worktree: " + made.stderr.strip()[:200])
            merged = git(trial, "merge", "--no-ff", "--no-commit", branch)
            if merged.returncode != 0:
                out(7, "merge-failed", reason="the branch does not merge cleanly into the current base",
                    detail=(merged.stdout + merged.stderr).strip()[-300:])
            setup = policy.get("worktree_setup")
            if setup:
                ok, snotes = worktree_setup.apply(repo, trial, setup)
                if not ok:
                    out(5, "setup-failed", reasons=snotes)
            pkgs = monorepo.detect(trial, policy)
            plan_cmds, scope_notes, unverified = verify_plan(repo, trial, args.base, base_head, branch, pkgs, mp, policy)
            notes += scope_notes
            if not plan_cmds:
                if mp.get("require_verify"):
                    out(4, "refused", reasons=["merge_policy.require_verify is on and verify_commands is empty"])
                notes.append("NO VERIFY: policy.merge_policy.verify_commands is empty, so nothing proved the merged result works")
            if unverified and mp.get("require_verify"):
                out(4, "refused", reasons=[f"package {n} changed but has no verify_commands (policy.packages)" for n in unverified])
            minutes = mp.get("verify_timeout_minutes", 30)
            for cmd, where in plan_cmds:
                done = run_cmd(cmd, os.path.join(trial, where) if where else trial, minutes)
                if done.returncode != 0 and mp.get("verify_retries", 1):
                    # One retry before judging: a flaky check should not read as a regression.
                    again = run_cmd(cmd, os.path.join(trial, where) if where else trial, minutes)
                    if again.returncode == 0:
                        notes.append(f"FLAKY: `{cmd}` failed once and passed on retry")
                    done = again
                if done.returncode == 0:
                    continue
                shown = f"{cmd} (in {where})" if where else cmd
                # Was it already red before this change? Run it once on the untouched base.
                if mp.get("check_baseline", True):
                    base_wt = os.path.join(tmp, "base")
                    if not os.path.isdir(base_wt):
                        git(repo, "worktree", "add", "--detach", base_wt, base_head)
                        if setup:
                            worktree_setup.apply(repo, base_wt, setup)
                    was = run_cmd(cmd, os.path.join(base_wt, where) if where else base_wt)
                    if was.returncode != 0:
                        if human_ok:
                            notes.append(f"BASELINE RED: `{shown}` already fails on {args.base}; merged on a human's say-so")
                            continue
                        out(5, "baseline-red", command=shown, exit_code=done.returncode,
                            reason=f"this check already fails on {args.base}, so it cannot show whether the change broke anything; "
                                   "fix the base, or have a human run /factory approve to merge anyway",
                            output=(done.stdout + done.stderr).strip()[-600:])
                out(5, "verify-failed", command=shown, exit_code=done.returncode,
                    regression=True, output=(done.stdout + done.stderr).strip()[-600:])
            if mp.get("constraints"):
                failed, cnotes, measured = ratchets.check(mp["constraints"], factory, trial)
                notes += cnotes
                if failed:
                    out(5, "constraint-failed", reasons=failed, measured=measured)
        finally:
            git(repo, "worktree", "remove", "--force", trial)
            git(repo, "worktree", "remove", "--force", os.path.join(tmp, "base"))
            shutil.rmtree(tmp, ignore_errors=True)

        if git(repo, "rev-parse", args.base).stdout.strip() != base_head:
            out(4, "refused", reasons=["the base moved while verifying; run the gate again"])
        if args.dry_run:
            out(0, "dry-run-ok", branch=branch, head=head, notes=notes)

        # 7. merge
        done = git(repo, "merge", "--no-ff", branch, "-m", f"Merge {branch}")
        if done.returncode != 0:
            git(repo, "merge", "--abort")
            out(7, "merge-failed", reason=(done.stdout + done.stderr).strip()[-300:])
        merged_sha = git(repo, "rev-parse", "HEAD").stdout.strip()
        cleanup = []
        wt = job.get("worktree")
        if wt and os.path.isdir(wt):
            r = git(repo, "worktree", "remove", wt)
            if r.returncode != 0:
                cleanup.append("worktree not removed: " + r.stderr.strip()[:160])
        r = git(repo, "branch", "-d", branch)
        if r.returncode != 0:
            cleanup.append("branch not deleted: " + r.stderr.strip()[:160])
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "jobctl.py"), "--factory", factory,
                        "set", args.job_id, "stage=merged"], capture_output=True, check=False)
        try:
            adr_note = adr_record.record(repo, factory, args.job_id, policy, args.base, git)
        except OSError as err:
            adr_note = f"ADR not recorded: {err}"
        if adr_note:
            notes.append(adr_note)
        out(0, "merged", merged_commit=merged_sha, reviewed_sha=pinned, notes=notes, cleanup_problems=cleanup)


if __name__ == "__main__":
    main()
