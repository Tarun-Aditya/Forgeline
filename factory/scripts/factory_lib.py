"""Shared helpers for the factory scripts and hooks. Standard library only."""

import json
import re

STAGES = [
    "intent",
    "spec",
    "spec-approval",
    "plan",
    "build",
    "review",
    "approve",
    "merged",
    "needs-human",
]
REVIEWERS = ["security", "ux", "ui", "code"]
REVIEW_VALUES = ["pending", "PASS", "CHANGES"]
JOB_TYPES = ["feature", "bugfix"]


def glob_to_regex(pattern):
    """Translate a path glob to a regex. `**` crosses folders, `*` and `?` do not."""
    out = []
    i = 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        elif pattern[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    return re.compile("^" + "".join(out) + "$")


def glob_match(pattern, path):
    """Match a repo-relative posix path. A pattern with no slash also matches the
    file name anywhere in the tree, so `deploy*` catches `scripts/deploy.sh`."""
    path = path.replace("\\", "/")
    if path.startswith("./"):
        path = path[2:]
    rx = glob_to_regex(pattern)
    if rx.match(path):
        return True
    if "/" not in pattern:
        return bool(rx.match(path.rsplit("/", 1)[-1]))
    return False


def any_match(patterns, path):
    return next((p for p in patterns if glob_match(p, path)), None)


def load_policy(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def changed_line_count(repo, base, branch, exclude):
    """Added plus deleted lines between base...branch, ignoring files matching `exclude`."""
    import subprocess
    out = subprocess.run(["git", "-C", repo, "diff", "--numstat", f"{base}...{branch}"],
                         capture_output=True, text=True, check=False)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip())
    total = 0
    for line in out.stdout.splitlines():
        added, deleted, path = (line.split("\t", 2) + ["", "", ""])[:3]
        if any_match(exclude, path):
            continue
        total += (int(added) if added.isdigit() else 0) + (int(deleted) if deleted.isdigit() else 0)
    return total
