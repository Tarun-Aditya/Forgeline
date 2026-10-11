#!/usr/bin/env python3
"""Commit a job's artifacts onto its branch, so the commit chain is the audit trail.

Job state lives in the main checkout under factory/jobs/<job-id>/ (gitignored
runtime state the dashboard reads). This copies that folder into the job's
worktree at factory/audit/<job-id>/ and commits it on the job branch. When the
branch merges, the record (intent, spec, plan, build log, every review round,
the decision) lands in main with the change.

  snapshot_audit.py <job-id> "<what just happened>"

Run from the main checkout. Safe to run when nothing changed or when the job has
no worktree yet (it skips).
"""

import argparse
import json
import os
import shutil
import subprocess
import sys


def git(worktree, *args):
    return subprocess.run(
        ["git", "-C", worktree, *args], capture_output=True, text=True, check=False
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("job_id")
    parser.add_argument("message")
    parser.add_argument("--factory", default="factory")
    args = parser.parse_args()

    job_dir = os.path.join(args.factory, "jobs", args.job_id)
    try:
        with open(os.path.join(job_dir, "job.json"), encoding="utf-8") as fh:
            job = json.load(fh)
    except FileNotFoundError:
        sys.exit(f"error: no such job {args.job_id}")

    worktree = job.get("worktree", "")
    if not worktree or not os.path.isdir(worktree):
        print(f"skip: {args.job_id} has no worktree yet")
        return

    dest_rel = os.path.join("factory", "audit", args.job_id)
    dest = os.path.join(worktree, dest_rel)
    shutil.copytree(job_dir, dest, dirs_exist_ok=True)

    added = git(worktree, "add", "--", dest_rel)
    if added.returncode != 0:
        sys.exit(f"error: git add failed: {added.stderr.strip()}")
    if git(worktree, "diff", "--cached", "--quiet", "--", dest_rel).returncode == 0:
        print("no changes")
        return

    prefix = f"{job['ticket']}: " if job.get("ticket") else ""
    msg = f"{prefix}audit({args.job_id}): {args.message}"
    done = git(worktree, "commit", "-m", msg, "--", dest_rel)
    if done.returncode != 0:
        sys.exit(f"error: git commit failed: {done.stderr.strip() or done.stdout.strip()}")
    print(f"committed: {msg}")


if __name__ == "__main__":
    main()
