#!/usr/bin/env python3
"""Turn a real GraphOS run (demo/graphos/golden.py) into fixtures that fake_claude.py replays for the video.

  python3 demo/graphos/build_fixtures.py [--steps demo/graphos/golden-steps.json] [--data /tmp/gf/golden-data] [--out demo/graphos/fixtures]

What is recorded, per run the golden script made:
  stream.jsonl   the `claude -p` stream-json log the web app showed
  activity       the hook events (tool calls per agent) for the run's session, with their relative times
  commits        every commit the agents made in a workspace during the run, with the files it changed
                 and their content at that commit. Commits made by the web app itself (author "Forgeline":
                 scope changes, decision answers) are skipped: the replayed web app makes those.

Paths are rewritten to {{REPO}} and the graphos/ folder to graphos-demo/, so the replay can run anywhere.
"""
import argparse
import calendar
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
UI_AUTHOR = "Forgeline"


def sh(*cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False).stdout


def unrepo(text):
    return text.replace(REPO + "/graphos/", "{{REPO}}/graphos-demo/").replace(REPO, "{{REPO}}")


def parse_ts(ts):
    return calendar.timegm(time.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S"))  # events are UTC


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--steps", default=os.path.join(HERE, "golden-steps.json"))
    ap.add_argument("--data", default="/tmp/gf/golden-data")
    ap.add_argument("--out", default=os.path.join(HERE, "fixtures"))
    a = ap.parse_args()
    gold = json.load(open(a.steps))
    if os.path.exists(a.out):
        shutil.rmtree(a.out)
    os.makedirs(os.path.join(a.out, "files"))
    gdir = os.path.join(REPO, "graphos")
    workspaces = sorted(d for d in os.listdir(gdir) if os.path.isdir(os.path.join(gdir, d, ".git")))
    runs, counts = [], {}
    for idx, st in enumerate(gold["steps"]):
        if st["kind"] == "ui":
            continue
        meta = json.load(open(os.path.join(a.data, "runs", st["runId"] + ".meta.json")))
        verb, ws = (st["prompt"].split() + ["", ""])[1:3]
        key = "%s %s" % (verb, ws)
        counts[key] = counts.get(key, 0) + 1
        stream = open(os.path.join(a.data, "runs", st["runId"] + ".jsonl"), encoding="utf-8").read().splitlines()
        sid = next((json.loads(l).get("session_id") for l in stream if '"session_id"' in l), None)
        t0, t1 = st["start"], st["end"] + 2
        out = {"index": idx, "name": st["name"], "verb": verb, "workspace": ws, "occurrence": counts[key], "prompt": st["prompt"],
               "duration": st["end"] - st["start"], "costUsd": st.get("costUsd"), "commits": [], "activity": []}
        # the stream
        with open(os.path.join(a.out, "stream-%d.jsonl" % idx), "w", encoding="utf-8") as fh:
            for l in stream:
                if l.strip():
                    fh.write(unrepo(l) + "\n")
        # hook activity for the session
        actf = os.path.join(REPO, "factory", "activity", "%s.jsonl" % sid)
        if sid and os.path.exists(actf):
            for l in open(actf, encoding="utf-8").read().splitlines():
                e = json.loads(l)
                t = parse_ts(e["ts"]) - t0
                if -5 <= t <= out["duration"] + 5:
                    e.pop("ts", None)
                    e.pop("pid", None)
                    out["activity"].append({"t": max(t, 0.0), "event": json.loads(unrepo(json.dumps(e)))})
        # agent commits in every workspace during the run
        for w in workspaces:
            wdir = os.path.join(gdir, w)
            log = sh("git", "log", "--reverse", "--format=%H%x09%an%x09%at%x09%s", cwd=wdir).splitlines()
            for line in log:
                h, author, at, subject = line.split("\t", 3)
                if author == UI_AUTHOR or not (t0 - 2 <= float(at) <= t1):
                    continue
                files = []
                n = len(out["commits"])
                raw = sh("git", "diff-tree", "--root", "--no-commit-id", "--name-status", "-r", h, cwd=wdir).splitlines()
                for r in raw:
                    status, path = r.split("\t", 1)
                    files.append({"path": path, "status": status[0]})
                    if status[0] != "D":
                        blob = subprocess.run(["git", "show", "%s:%s" % (h, path)], cwd=wdir, capture_output=True).stdout
                        dst = os.path.join(a.out, "files", str(idx), str(n), w, path)
                        os.makedirs(os.path.dirname(dst), exist_ok=True)
                        try:
                            open(dst, "w", encoding="utf-8").write(unrepo(blob.decode("utf-8")))
                        except UnicodeDecodeError:
                            open(dst, "wb").write(blob)
                out["commits"].append({"t": max(float(at) - t0, 0.0), "workspace": w, "subject": subject, "files": files, "dir": "%d/%d" % (idx, n)})
        out["commits"].sort(key=lambda c: c["t"])
        runs.append(out)
        print("%-28s %3d commits  %4d activity  %5.0fs" % (st["name"], len(out["commits"]), len(out["activity"]), out["duration"]))
    # the answers the golden run gave, by decision id: the video clicks exactly these, so the replayed schema stays true
    answers = {}
    for w in workspaces:
        ddir = os.path.join(gdir, w, ".factory", "decisions")
        for f in sorted(os.listdir(ddir)) if os.path.isdir(ddir) else []:
            d = json.load(open(os.path.join(ddir, f)))["decision"]
            res = d.get("resolution") or {}
            if res.get("by") == "user":
                answers[d["id"]] = {"workspace": w, "title": d["title"], "phase": d.get("phase"), "choices": [c["id"] for c in d.get("choices", [])],
                                    "chosen": res.get("chosen", []), "note": res.get("note", "")}
    json.dump({"workspace": gold["workspace"], "handEdit": gold.get("handEdit"), "steps": gold["steps"], "runs": runs, "answers": answers}, open(os.path.join(a.out, "timeline.json"), "w"), indent=1)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
