#!/usr/bin/env python3
"""Real diffs of one merged job, for the code walkthrough page.

Usage: build-data.py <repo> <before-ref> <after-ref>   -> data.json next to this script
Lists the files the job changed (server/, web/ and the factory's audit trail and ADR), with each
file's text before and after, and the commits between the two refs.
"""
import json, os, subprocess, sys

repo, before, after = sys.argv[1:4]
here = os.path.dirname(os.path.abspath(__file__))


def git(*a, check=True):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, check=check).stdout


def show(ref, path):
    r = subprocess.run(["git", "-C", repo, "show", f"{ref}:{path}"], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


nums = {}
for line in git("diff", "--numstat", before, after).splitlines():
    a, d, p = line.split("\t")
    nums[p] = (int(a) if a != "-" else 0, int(d) if d != "-" else 0)

KEEP_RECORD = {"intent.md", "spec.md", "plan.md", "build.md", "decision.md"}

def group(p):
    if p.startswith("server/"): return "server"
    if p.startswith("web/"): return "web"
    if p.startswith("docs/adr/") or (p.startswith("factory/audit/") and p.split("/")[-1] in KEEP_RECORD and "round-" not in p): return "record"
    return None

files = []
for line in git("diff", "--name-status", before, after).splitlines():
    st, p = line.split("\t")[:2]
    g = group(p)
    if not g:
        continue
    files.append({"path": p, "group": g, "status": st, "add": nums[p][0], "del": nums[p][1],
                  "original": show(before, p), "modified": show(after, p)})
# the order the change is told in: the contract first, then each side's code, then its tests
STORY = ["server/src/store.ts", "server/src/schema.ts", "server/src/schema.test.ts",
         "web/src/graphql.ts", "web/src/App.tsx", "web/src/AddTaskForm.tsx", "web/src/TaskItem.tsx",
         "web/src/styles.css", "web/src/components.test.tsx",
         "docs/adr/0001-task-priority.md"] + [f"factory/audit/001-task-priority/{n}.md" for n in ("intent", "spec", "plan", "build", "decision")]
rank = lambda f: STORY.index(f["path"]) if f["path"] in STORY else len(STORY)
files.sort(key=rank)

commits = []
for line in git("log", "--reverse", "--first-parent", "--no-merges", "--format=%h\t%s", f"{before}..{after}").splitlines():
    pass
for line in git("log", "--reverse", "--format=%h\t%s", f"{before}..{after}").splitlines():
    h, s = line.split("\t", 1)
    commits.append({"hash": h, "subject": s})

branch = git("rev-parse", "--abbrev-ref", "HEAD").strip()
json.dump({"repo": os.path.basename(repo), "branch": branch, "files": files, "commits": commits},
          open(os.path.join(here, "data.json"), "w"))
print(len(files), "files,", len(commits), "commits")
