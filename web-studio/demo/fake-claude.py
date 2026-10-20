#!/usr/bin/env python3
"""Stand-in for `claude -p` that replays a recorded factory job, for demos.

Point the web app at it with CLAUDE_BIN=/path/to/fake-claude.py. It reads the prompt the web app
passes, picks the recorded run that matches (start, accept or approve-spec), and replays it in the
current directory (the demo repo): the stream-json lines go to stdout, and the files the real run
wrote (job.json stage changes, intent.md, spec.md, plan.md, build.md, reviews, decision.md) and the
hook activity events appear at the same relative moments. Nothing here calls a model.

DEMO_SPEED    how many times faster than the recording (default 3)
"""
import json, os, shutil, sys, time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures")
SPEED = float(os.environ.get("DEMO_SPEED", "3"))
repo = os.getcwd()

args = sys.argv[1:]
prompt = args[args.index("-p") + 1] if "-p" in args else ""
key = "accept" if "factory accept" in prompt else "approve" if "approve-spec" in prompt else "start"

data = json.load(open(os.path.join(FIX, "timeline.json")))
meta, timeline = data["meta"], data["timeline"][key]
duration = meta["durations"][key]
sid = f"demo-{key}-{os.getpid()}"
pid = os.getpid()


def load_stream():
    out = []
    for line in open(os.path.join(FIX, key + ".jsonl")).read().splitlines():
        if not line.strip():
            continue
        o = json.loads(line.replace("{{REPO}}", repo))
        if o.get("type") == "system":
            o = {"type": "system", "subtype": "init", "session_id": sid, "cwd": repo}
        elif "session_id" in o:
            o["session_id"] = sid
        out.append(json.dumps(o))
    return out


stream = load_stream()

job_id = meta["job"]
jobdir = os.path.join(repo, "factory", "jobs", job_id)
actdir = os.path.join(repo, "factory", "activity")
os.makedirs(actdir, exist_ok=True)
def now():
    return datetime.now(timezone.utc)


def iso(d=None):
    return (d or now()).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_job():
    return json.load(open(os.path.join(jobdir, "job.json")))


def write_job(j):
    tmp = os.path.join(jobdir, "job.json.tmp")
    json.dump(j, open(tmp, "w"), indent=2)
    os.replace(tmp, os.path.join(jobdir, "job.json"))


def copy_file(rel):
    dst = os.path.join(jobdir, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy(os.path.join(FIX, "files", rel), dst)


def activity(ev):
    d = now()
    row = {"ts": d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 100:04d}Z", "sid": sid, **ev, "pid": pid}
    with open(os.path.join(actdir, sid + ".jsonl"), "a") as f:
        f.write(json.dumps(row) + "\n")
    if os.path.isdir(jobdir):
        open(os.path.join(actdir, sid + ".job"), "w").write(job_id)


def apply(item):
    op = item["op"]
    if op == "create":
        os.makedirs(jobdir, exist_ok=True)
        write_job({
            "id": job_id, "feature": prompt.split("/factory", 1)[-1].strip() or meta["feature"], "type": meta["type"],
            "ticket": None, "branch": "factory/" + job_id, "stage": "intent", "round": 0, "reviews": {},
            "respecs": 0, "reworks": 0, "created": iso(), "intent_waived": None, "history": [{"stage": "intent", "at": iso()}],
        })
    elif op == "stage":
        j = read_job()
        j["stage"] = item["stage"]
        if item["stage"] == "review":
            j["round"] = meta["round"]
        j["history"].append({"stage": item["stage"], "at": iso()})
        write_job(j)
    elif op == "file":
        copy_file(item["file"])
    elif op == "review":
        copy_file(item["file"])
        j = read_job()
        j["reviews"][item["lens"]] = meta["reviews"].get(item["lens"], "PASS")
        write_job(j)
    elif op == "activity":
        activity(item["event"])


# One schedule: every timeline item at its recorded second, stream lines spread over the run.
events = [(i["t"], 0, i) for i in timeline]
n = len(stream)
for idx, line in enumerate(stream):
    t = 0.0 if idx == 0 else duration * idx / n
    events.append((t, 1, line))
events.sort(key=lambda e: (e[0], e[1]))

start = time.monotonic()
for t, kind, payload in events:
    wait = t / SPEED - (time.monotonic() - start)
    if wait > 0:
        time.sleep(wait)
    if kind == 0:
        apply(payload)
    else:
        sys.stdout.write(payload + "\n")
        sys.stdout.flush()
wait = duration / SPEED - (time.monotonic() - start)
if wait > 0:
    time.sleep(wait)
