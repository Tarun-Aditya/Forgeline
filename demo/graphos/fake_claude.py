#!/usr/bin/env python3
"""Stand-in for `claude -p` that replays a recorded GraphOS run, for the demo video. No model is called.

Point the web app at it with CLAUDE_BIN=/path/to/fake_claude.py and FORGELINE_GRAPHOS_DIR=graphos-demo. It reads the
prompt the web app passes (`/graphos <verb> <workspace> ...`), picks the recorded run for that verb and workspace
(the Nth time the same pair is asked, the Nth recording), and replays it in the current directory (the repo):

  - the stream-json lines go to stdout, so the Runs panel shows the run
  - the commits the agents made are re-applied to graphos-demo/<workspace>/ at the same relative moments,
    each as a real commit in the workspace's own Git repo
  - the hook activity events (tool calls per agent) are written to factory/activity/, so the Agents view animates

Environment:
  DEMO_FIXTURES   fixtures folder (default: fixtures beside this file)
  DEMO_SPEED      times faster than recorded (default 10)
  DEMO_MAX_SECS   no replayed run lasts longer than this (default 45)
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.environ.get("DEMO_FIXTURES") or os.path.join(HERE, "fixtures")
SPEED = float(os.environ.get("DEMO_SPEED", "10"))
MAXS = float(os.environ.get("DEMO_MAX_SECS", "45"))
repo = os.getcwd()
gdir = os.path.join(repo, os.environ.get("FORGELINE_GRAPHOS_DIR", "graphos-demo"))

args = sys.argv[1:]
# the web app passes the prompt as `-p <prompt>` (Studio) or after `--` (older); take the /graphos command wherever it is
prompt = next((a for a in args if a.startswith("/graphos") or a.startswith("/factory")), args[args.index("--") + 1] if "--" in args else args[-1])
parts = prompt.split()
verb, ws = (parts + ["", ""])[1:3]
data = json.load(open(os.path.join(FIX, "timeline.json")))

# the Nth ask of the same (verb, workspace) replays the Nth recording; the counter lives beside the workspaces
cursor_file = os.path.join(gdir, ".replay-cursor.json")
os.makedirs(gdir, exist_ok=True)
cursor = json.load(open(cursor_file)) if os.path.exists(cursor_file) else {}
key = "%s %s" % (verb, ws)
cursor[key] = cursor.get(key, 0) + 1
json.dump(cursor, open(cursor_file, "w"))
run = next((r for r in data["runs"] if r["verb"] == verb and r["workspace"] == ws and r["occurrence"] == cursor[key]), None)
if run is None:
    run = next((r for r in reversed(data["runs"]) if r["verb"] == verb), None)
if run is None:
    print(json.dumps({"type": "result", "subtype": "error", "is_error": True, "result": "no recording for " + prompt}))
    sys.exit(1)

speed = max(SPEED, run["duration"] / MAXS)
pid = os.getpid()
sid = "demo-%s-%d" % (verb, pid)
actdir = os.path.join(repo, "factory", "activity")
os.makedirs(actdir, exist_ok=True)
env = {**os.environ, "GIT_AUTHOR_NAME": "Forgeline agent", "GIT_AUTHOR_EMAIL": "agent@forgeline.local", "GIT_COMMITTER_NAME": "Forgeline agent", "GIT_COMMITTER_EMAIL": "agent@forgeline.local"}


def now():
    d = datetime.now(timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + "%04dZ" % (d.microsecond // 100)


def swap(text):
    return text.replace("{{REPO}}", repo)


def activity(ev):
    row = {"ts": now(), **ev, "sid": sid, "pid": pid}
    with open(os.path.join(actdir, sid + ".jsonl"), "a") as f:
        f.write(json.dumps(row) + "\n")
    if ev.get("job") and not os.path.exists(os.path.join(actdir, sid + ".job")):
        open(os.path.join(actdir, sid + ".job"), "w").write(ev["job"])


def commit(c):
    base = os.path.join(FIX, "files", c["dir"])
    wdir = os.path.join(gdir, c["workspace"])
    os.makedirs(wdir, exist_ok=True)
    if not os.path.isdir(os.path.join(wdir, ".git")):
        subprocess.run(["git", "init", "-q"], cwd=wdir, check=True, env=env)
    for f in c["files"]:
        dst = os.path.join(wdir, f["path"])
        if f["status"] == "D":
            if os.path.exists(dst):
                os.remove(dst)
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        src = os.path.join(base, c["workspace"], f["path"])
        try:
            open(dst, "w", encoding="utf-8").write(swap(open(src, encoding="utf-8").read()))
        except UnicodeDecodeError:
            open(dst, "wb").write(open(src, "rb").read())
    subprocess.run(["git", "add", "-A"], cwd=wdir, check=True, env=env)
    subprocess.run(["git", "commit", "-q", "--allow-empty", "-m", c["subject"]], cwd=wdir, check=False, env=env, capture_output=True)


stream = []
for line in open(os.path.join(FIX, "stream-%d.jsonl" % run["index"]), encoding="utf-8").read().splitlines():
    if not line.strip():
        continue
    o = json.loads(swap(line))
    if o.get("type") == "system":
        o = {"type": "system", "subtype": "init", "session_id": sid, "cwd": repo}
    elif "session_id" in o:
        o["session_id"] = sid
    stream.append(json.dumps(o))

events = [(c["t"], 0, c) for c in run["commits"]] + [(a["t"], 2, a) for a in run["activity"]]
n = len(stream)
for i, line in enumerate(stream):
    events.append((0.0 if i == 0 else run["duration"] * i / n, 1, line))
events.sort(key=lambda e: (e[0], e[1]))

start = time.monotonic()
for t, kind, payload in events:
    wait = t / speed - (time.monotonic() - start)
    if wait > 0:
        time.sleep(wait)
    if kind == 0:
        commit(payload)
    elif kind == 2:
        activity(json.loads(swap(json.dumps(payload["event"]))))
    else:
        sys.stdout.write(payload + "\n")
        sys.stdout.flush()
wait = run["duration"] / speed - (time.monotonic() - start)
if wait > 0:
    time.sleep(wait)
