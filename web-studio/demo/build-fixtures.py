#!/usr/bin/env python3
"""Turn one real web-driven factory job into replay fixtures for the demo.

Usage: build-fixtures.py <repo> <web-data-dir>
  <repo>          the repo the job ran in (has factory/jobs and factory/activity)
  <web-data-dir>  the web app's FORGELINE_WEB_DATA (has runs.jsonl and runs/<id>.jsonl)

Writes demo/fixtures/: three trimmed run streams, the job's artifact files, and a timeline that
says, in real seconds since each run started, when the stage changed, which file appeared and
which activity event was recorded. fake-claude.py replays them at a chosen speed.
"""
import json, os, shutil, sys
from datetime import datetime, timezone

repo, data = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, os.environ.get("DEMO_FIXTURES", "fixtures"))
shutil.rmtree(out, ignore_errors=True)
os.makedirs(os.path.join(out, "files", "round-1"))

def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc).timestamp()

runs = sorted((json.loads(l) for l in open(os.path.join(data, "runs.jsonl"))), key=lambda r: r["startedAt"])
assert len(runs) in (3, 4), "expected start, accept and approve-spec runs, and optionally the final approve (merge) run"
keys = ["start", "accept", "approve", "merge"][:len(runs)]
windows = {k: (ts(r["startedAt"]), ts(r["endedAt"])) for k, r in zip(keys, runs)}

jobdir = next(os.path.join(repo, "factory", "jobs", d) for d in sorted(os.listdir(os.path.join(repo, "factory", "jobs"))))
job = json.load(open(os.path.join(jobdir, "job.json")))

def which(t):
    for k in keys:
        a, b = windows[k]
        if a - 1 <= t <= b + 1:
            return k
    return min(keys, key=lambda k: abs(t - windows[k][0]))

timeline = {k: [] for k in keys}
def add(t, **item):
    k = which(t)
    timeline[k].append({"t": round(max(0.0, t - windows[k][0]), 2), **item})

add(ts(job["created"]), op="create")
for h in job["history"][1:]:
    add(ts(h["at"]), op="stage", stage=h["stage"])
for root, _, files in os.walk(jobdir):
    for f in files:
        if f == "job.json":
            continue
        p = os.path.join(root, f)
        rel = os.path.relpath(p, jobdir)
        dst = os.path.join(out, "files", rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy(p, dst)
        if rel.startswith("round-1/review-"):
            add(os.path.getmtime(p), op="review", lens=f[len("review-"):-3], file=rel)
        else:
            add(os.path.getmtime(p), op="file", file=rel)

act = os.path.join(repo, "factory", "activity")
for f in os.listdir(act):
    if f.endswith(".jsonl"):
        for line in open(os.path.join(act, f)):
            e = json.loads(line)
            add(ts(e["ts"]), op="activity", event={k: e[k] for k in ("ev", "agent", "tool", "text", "job", "ms") if k in e})

for k in keys:
    timeline[k].sort(key=lambda i: i["t"])

meta = {"job": job["id"], "feature": job["feature"], "type": job["type"], "round": job["round"], "reviews": job["reviews"], "durations": {k: round(windows[k][1] - windows[k][0], 1) for k in keys}}
json.dump({"meta": meta, "timeline": timeline}, open(os.path.join(out, "timeline.json"), "w"), indent=1)

KEEP = {"assistant", "user", "result"}
for k, r in zip(keys, runs):
    kept = []
    for line in open(os.path.join(data, "runs", r["runId"] + ".jsonl")):
        try:
            o = json.loads(line)
        except ValueError:
            continue
        if o.get("type") in KEEP or (o.get("type") == "system" and o.get("subtype") == "init" and not kept):
            kept.append(line.rstrip("\n").replace(repo, "{{REPO}}"))
    open(os.path.join(out, k + ".jsonl"), "w").write("\n".join(kept) + "\n")
    print(k, len(kept), "stream lines,", len(timeline[k]), "timeline items")
