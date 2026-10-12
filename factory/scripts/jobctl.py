#!/usr/bin/env python3
"""Create and update a factory job's job.json.

The orchestrator is the only writer of job.json and uses this script instead of
hand-editing it, so every stage change is timestamped (the metrics read these)
and the file is always valid.

  jobctl.py create --slug rate-limiting (--feature "Rate limit signup" | --feature-file PATH) \\
      [--worktree-root /abs/<repo>-factory] [--type feature|bugfix] [--ticket KEY] \\
      [--stage spec|intent] [--waive-intent "reason"]
      When policy.intent_required is true (the default in the shipped policy), a job
      cannot start at stage spec and cannot move to spec without an intent.md,
      unless a person waived it with --waive-intent; the reason is kept in job.json.
      The job's worktree is <worktree-root>/<job-id>. The root defaults to a
      sibling of the repo named <repo>-factory, the layout the hooks expect.
  jobctl.py set <job-id> stage=build round=2 reviews.security=CHANGES
  jobctl.py set <job-id> reviews=reset
  jobctl.py bump <job-id> respecs|reworks
  jobctl.py set <job-id> reviewed_sha=head     pin the job branch's current head
  jobctl.py pause <job-id> --reason TEXT | resume <job-id> | active
  jobctl.py show <job-id>

Run from the main checkout. `--factory` defaults to ./factory.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from factory_lib import JOB_TYPES, REVIEWERS, REVIEW_VALUES, STAGES  # noqa: E402

SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+){0,3}$")
COUNTERS = ("respecs", "reworks")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def job_path(factory, job_id):
    return os.path.join(factory, "jobs", job_id, "job.json")


def read_job(factory, job_id):
    with open(job_path(factory, job_id), encoding="utf-8") as fh:
        return json.load(fh)


def write_job(factory, job_id, job):
    path = job_path(factory, job_id)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(job, fh, indent=2)
        fh.write("\n")
    os.replace(tmp, path)


def claim_job_dir(factory, slug):
    """Claim the next 3-digit job number with a plain mkdir, so two sessions can
    never take the same number. Retries if another session wins the race."""
    jobs = os.path.join(factory, "jobs")
    os.makedirs(jobs, exist_ok=True)
    while True:
        nums = [int(m.group(1)) for n in os.listdir(jobs) if (m := re.match(r"^(\d{3})-", n))]
        job_id = f"{max(nums, default=0) + 1:03d}-{slug}"
        try:
            os.mkdir(os.path.join(jobs, job_id))
            return job_id
        except FileExistsError:
            continue


def intent_required(factory):
    try:
        with open(os.path.join(factory, "policy.json"), encoding="utf-8") as fh:
            return bool(json.load(fh).get("intent_required", False))
    except (OSError, ValueError):
        return False


def cmd_create(args):
    if not SLUG_RE.match(args.slug):
        sys.exit("error: --slug must be 1-4 lowercase words joined by hyphens")
    if bool(args.feature) == bool(args.feature_file):
        sys.exit("error: give exactly one of --feature and --feature-file")
    if args.feature_file:
        with open(args.feature_file, encoding="utf-8") as fh:
            args.feature = fh.read().strip()
    if not args.worktree_root:
        repo = os.path.dirname(os.path.abspath(args.factory))
        args.worktree_root = os.path.join(os.path.dirname(repo), os.path.basename(repo) + "-factory")
    if not os.path.isabs(args.worktree_root):
        sys.exit("error: --worktree-root must be an absolute path")
    if args.type not in JOB_TYPES:
        sys.exit(f"error: --type must be one of {JOB_TYPES}")
    if args.stage not in ("intent", "spec"):
        sys.exit("error: a job can only start at stage intent or spec")
    if args.waive_intent is not None and len(args.waive_intent.strip()) < 5:
        sys.exit("error: --waive-intent needs a real reason; it is kept in the record")
    parent = None
    if args.intent_from:
        if not args.parent or args.intent_from != args.parent:
            sys.exit("error: --intent-from must name the --parent job")
        parent = read_job(args.factory, args.parent)
        if args.waive_intent:
            sys.exit("error: a split job inherits its parent's intent; do not waive it")
        if not os.path.isfile(os.path.join(args.factory, "jobs", args.parent, "intent.md")) and not parent.get("intent_waived"):
            sys.exit("error: the parent has no accepted intent to inherit")
    elif args.parent:
        sys.exit("error: --parent needs --intent-from <parent> so the child carries the accepted intent")
    depends = [d for d in (args.depends or "").split(",") if d]
    for dep in depends:
        read_job(args.factory, dep)  # must exist
    if args.stage == "spec" and intent_required(args.factory) and not args.waive_intent and not args.intent_from:
        sys.exit("error: policy.intent_required is true: start with --stage intent (/factory intent), "
                 "or have a person waive it with --waive-intent \"reason\"")
    job_id = claim_job_dir(args.factory, args.slug)
    stamp = now()
    job = {
        "id": job_id,
        "feature": args.feature,
        "type": args.type,
        "ticket": args.ticket,
        "branch": f"factory/{job_id}",
        "worktree": os.path.join(args.worktree_root, job_id),
        "stage": args.stage,
        "round": 0,
        "reviews": {r: "pending" for r in REVIEWERS},
        "respecs": 0,
        "reworks": 0,
        "created": stamp,
        "intent_waived": args.waive_intent.strip() if args.waive_intent else (parent or {}).get("intent_waived"),
        "history": [{"stage": args.stage, "at": stamp}],
    }
    if args.parent:
        job["parent"] = args.parent
    if depends:
        job["depends_on"] = depends
    if args.intent_from:
        src = os.path.join(args.factory, "jobs", args.parent, "intent.md")
        if os.path.isfile(src):
            shutil.copyfile(src, os.path.join(args.factory, "jobs", job_id, "intent.md"))
        parent.setdefault("children", []).append(job_id)
        write_job(args.factory, args.parent, parent)
    write_job(args.factory, job_id, job)
    print(job_id)


def apply_pair(job, pair):
    if "=" not in pair:
        sys.exit(f"error: expected key=value, got {pair!r}")
    key, value = pair.split("=", 1)
    if key == "stage":
        if value not in STAGES:
            sys.exit(f"error: unknown stage {value!r}; one of {STAGES}")
        if job["stage"] != value:
            job["stage"] = value
            job["history"].append({"stage": value, "at": now()})
    elif key == "round":
        job["round"] = int(value)
    elif key == "type":
        if value not in JOB_TYPES:
            sys.exit(f"error: type must be one of {JOB_TYPES}")
        job["type"] = value
    elif key == "ticket":
        job["ticket"] = None if value in ("", "none") else value
    elif key == "reviews" and value == "reset":
        job["reviews"] = {r: "pending" for r in REVIEWERS}
    elif key.startswith("reviews."):
        name = key.split(".", 1)[1]
        if name not in REVIEWERS:
            sys.exit(f"error: unknown reviewer {name!r}; one of {REVIEWERS}")
        if value not in REVIEW_VALUES:
            sys.exit(f"error: review value must be one of {REVIEW_VALUES}")
        job["reviews"][name] = value
    else:
        sys.exit(f"error: cannot set {key!r}")


def cmd_set(args):
    job = read_job(args.factory, args.job_id)
    for pair in list(args.pairs):
        if pair == "reviewed_sha=head":  # pin the branch head the reviews and the approver will see
            repo = os.path.dirname(os.path.abspath(args.factory))
            head = subprocess.run(["git", "-C", repo, "rev-parse", "--verify", job["branch"]],
                                  capture_output=True, text=True, check=False)
            if head.returncode != 0:
                sys.exit(f"error: cannot resolve branch {job['branch']}: {head.stderr.strip()}")
            job["reviewed_sha"] = head.stdout.strip()
            job["reviewed_at"] = now()
            args.pairs.remove(pair)
    for pair in args.pairs:
        if (pair == "stage=spec" and job["stage"] != "spec" and intent_required(args.factory)
                and not job.get("intent_waived")
                and not os.path.isfile(os.path.join(args.factory, "jobs", args.job_id, "intent.md"))):
            sys.exit("error: policy.intent_required is true and this job has no intent.md")
        apply_pair(job, pair)
    write_job(args.factory, args.job_id, job)
    print(json.dumps(job))


def cmd_bump(args):
    job = read_job(args.factory, args.job_id)
    job[args.counter] = int(job.get(args.counter, 0)) + 1
    write_job(args.factory, args.job_id, job)
    print(job[args.counter])


def cmd_pause(args):
    job = read_job(args.factory, args.job_id)
    if job["stage"] in ("merged",):
        sys.exit("error: the job is already merged")
    if len(args.reason.strip()) < 3:
        sys.exit("error: give a reason")
    job["paused"] = {"at": now(), "reason": args.reason.strip(), "stage": job["stage"]}
    write_job(args.factory, args.job_id, job)
    print(json.dumps(job["paused"]))


def cmd_resume(args):
    job = read_job(args.factory, args.job_id)
    if not job.get("paused"):
        sys.exit("error: the job is not paused")
    was = job.pop("paused")
    job.setdefault("pauses", []).append(dict(was, resumed=now()))
    write_job(args.factory, args.job_id, job)
    print(json.dumps({"resume_at_stage": job["stage"], "paused_at_stage": was["stage"]}))


def cmd_active(args):
    jobs_dir = os.path.join(args.factory, "jobs")
    rows = []
    for name in sorted(os.listdir(jobs_dir)) if os.path.isdir(jobs_dir) else []:
        path = os.path.join(jobs_dir, name, "job.json")
        if os.path.isfile(path):
            job = json.load(open(path, encoding="utf-8"))
            if job["stage"] not in ("merged", "needs-human", "intent", "spec-approval", "split"):
                rows.append({"id": name, "stage": job["stage"], "paused": bool(job.get("paused"))})
    print(json.dumps(rows, indent=2))


def all_jobs(factory):
    jobs_dir = os.path.join(factory, "jobs")
    out = {}
    for name in sorted(os.listdir(jobs_dir)) if os.path.isdir(jobs_dir) else []:
        path = os.path.join(jobs_dir, name, "job.json")
        if os.path.isfile(path):
            out[name] = json.load(open(path, encoding="utf-8"))
    return out


def cmd_ready(args):
    """Split children whose dependencies have all merged and that have no spec yet."""
    jobs = all_jobs(args.factory)
    rows, closed = [], []
    for name, job in jobs.items():
        if job.get("parent") and job["stage"] == "spec" and not os.path.isfile(os.path.join(args.factory, "jobs", name, "spec.md")):
            waiting = [d for d in job.get("depends_on", []) if jobs.get(d, {}).get("stage") != "merged"]
            rows.append({"id": name, "parent": job["parent"], "ready": not waiting, "waiting_on": waiting})
    if args.close_parents:
        for name, job in jobs.items():
            kids = job.get("children") or []
            if job["stage"] == "split" and kids and all(jobs.get(k, {}).get("stage") == "merged" for k in kids):
                job["stage"] = "merged"
                job["history"].append({"stage": "merged", "at": now()})
                write_job(args.factory, name, job)
                closed.append(name)
    print(json.dumps({"jobs": rows, "parents_closed": closed}, indent=2))


def cmd_show(args):
    print(json.dumps(read_job(args.factory, args.job_id), indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--factory", default="factory")
    sub = parser.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create")
    c.add_argument("--slug", required=True)
    c.add_argument("--feature")
    c.add_argument("--feature-file")
    c.add_argument("--worktree-root")
    c.add_argument("--type", default="feature")
    c.add_argument("--ticket", default=None)
    c.add_argument("--stage", default="spec")
    c.add_argument("--waive-intent", default=None)
    c.add_argument("--parent", default=None, help="the job this one was split from")
    c.add_argument("--intent-from", default=None, help="inherit the parent's accepted intent")
    c.add_argument("--depends", default=None, help="comma-separated job ids that must merge first")
    c.set_defaults(fn=cmd_create)

    s = sub.add_parser("set")
    s.add_argument("job_id")
    s.add_argument("pairs", nargs="+")
    s.set_defaults(fn=cmd_set)

    b = sub.add_parser("bump")
    b.add_argument("job_id")
    b.add_argument("counter", choices=COUNTERS)
    b.set_defaults(fn=cmd_bump)

    pz = sub.add_parser("pause")
    pz.add_argument("job_id")
    pz.add_argument("--reason", required=True)
    pz.set_defaults(fn=cmd_pause)

    rs = sub.add_parser("resume")
    rs.add_argument("job_id")
    rs.set_defaults(fn=cmd_resume)

    ac = sub.add_parser("active")
    ac.set_defaults(fn=cmd_active)

    rd = sub.add_parser("ready")
    rd.add_argument("--close-parents", action="store_true", help="mark a split parent merged once every child merged")
    rd.set_defaults(fn=cmd_ready)

    sh = sub.add_parser("show")
    sh.add_argument("job_id")
    sh.set_defaults(fn=cmd_show)

    args = parser.parse_args()
    try:
        args.fn(args)
    except FileNotFoundError as err:
        sys.exit(f"error: {err}")


if __name__ == "__main__":
    main()
