#!/usr/bin/env python3
"""Factory activity log: one shared record of what the agents are doing.

Claude Code hooks run in every surface (terminal, desktop app, VS Code, headless runs, the
web app), so a hook that appends events to a file gives every surface the same live view.

  activity.py record                      hook entry point: reads a hook payload on stdin
  activity.py feed [--job ID] [-f] [-n N] [--json]    print the feed; -f follows it
  activity.py status [--json|--line] [--stall-minutes N]
                                          one line per session: running, idle, ended,
                                          stalled or crashed, with the resume hint

Events go to factory/activity/<session-id>.jsonl, one JSON object per line. The log holds
short summaries only (never tool output) with obvious secrets redacted, and is gitignored.
`record` never fails a session: any error is swallowed and it exits 0.

Standard library only.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

ACTIVITY = os.path.join("factory", "activity")
STALL_MINUTES = 10
JOB_ID = r"\d{3,}-[a-z0-9][a-z0-9-]*"
JOB_IN_PATH = re.compile(rf"(?:factory/jobs/|-factory/|factory/)({JOB_ID})")
JOB_IN_COMMAND = re.compile(rf"/factory\s+(?:accept|approve-spec|respec|approve|rework|resume|stop)\s+({JOB_ID})")
GX_NAME = r"[A-Za-z0-9][A-Za-z0-9._-]*"
GX_IN_PATH = re.compile(rf"graphos/({GX_NAME})")
GX_IN_COMMAND = re.compile(rf"/graphos\s+(?:new|continue|refresh|record|review|validate|codify|compose|ask|export|fix)\s+({GX_NAME})")
REDACT = [
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"),
    re.compile(r"(?i)((?:api[_-]?key|secret|passwd|password|token|authorization)\s*[:=]\s*)\S+"),
    re.compile(r"(?i)(bearer\s+)\S+"),
]
EVENTS = {
    "SessionStart": "session_start",
    "UserPromptSubmit": "prompt",
    "PreToolUse": "tool",
    "PostToolUse": "tool_done",
    "SubagentStart": "subagent_start",
    "SubagentStop": "subagent_stop",
    "Stop": "stop",
    "SessionEnd": "session_end",
}


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def parse_ts(ts):
    # Older Pythons only accept 3 or 6 fractional digits, and older logs hold 4.
    ts = re.sub(r"\.(\d+)", lambda m: "." + m.group(1)[:6].ljust(6, "0"), ts.replace("Z", "+00:00"), count=1)
    return datetime.fromisoformat(ts)


def redact(text):
    for rx in REDACT:
        text = rx.sub(lambda m: (m.group(1) + "[redacted]") if m.groups() else "[redacted]", text)
    return text


def clip(text, n):
    text = " ".join(str(text).split())
    return text if len(text) <= n else text[: n - 1] + "…"


# --------------------------------------------------------------------------- locating

def project_root(project=None):
    """The main checkout, even when a hook runs from a factory worktree."""
    project = project or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    if os.path.isfile(os.path.join(project, ".git")):  # a worktree has a .git file
        try:
            out = subprocess.run(
                ["git", "-C", project, "rev-parse", "--path-format=absolute", "--git-common-dir"],
                capture_output=True, text=True, timeout=5,
            ).stdout.strip()
            if out.endswith(".git"):
                return os.path.dirname(out)
        except (OSError, subprocess.SubprocessError):
            pass
    return project


def activity_dir(root):
    return os.path.join(root, ACTIVITY)


# --------------------------------------------------------------------------- recording

SHELLS = {"sh", "bash", "zsh", "dash", "fish", "ksh"}


def _proc(pid):
    """(parent pid, command name) of a process, or None. /proc on Linux, ps elsewhere."""
    try:
        with open(f"/proc/{pid}/stat", encoding="utf-8") as fh:
            stat = fh.read()
        head, tail = stat.split("(", 1)[1].rsplit(")", 1)
        return int(tail.split()[1]), head
    except (OSError, ValueError, IndexError):
        pass
    try:
        out = subprocess.run(["ps", "-o", "ppid=,comm=", "-p", str(pid)], capture_output=True, text=True, timeout=3).stdout
        ppid, comm = out.strip().split(None, 1)
        return int(ppid), os.path.basename(comm)
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def host_pid():
    """The Claude Code process running this hook: the first ancestor that is not a shell
    (a command hook runs as hook -> sh -> claude). None when it cannot be told."""
    pid = os.getpid()
    for _ in range(5):
        info = _proc(pid)
        if not info or info[0] <= 1:
            return None
        pid = info[0]
        if (_proc(pid) or (0, ""))[1] not in SHELLS:
            return pid
    return None


def pid_alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except OSError:
        return True  # exists, owned by someone else
    try:  # a killed process stays a zombie until its parent reaps it; that is dead
        with open(f"/proc/{pid}/stat", encoding="utf-8") as fh:
            return fh.read().rsplit(")", 1)[1].split()[0] != "Z"
    except (OSError, IndexError):
        return True  # no /proc (macOS): kill(0) said it exists

def summarize(payload):
    """(tool, text) for one hook payload: a short human line, never tool output."""
    name = payload.get("tool_name") or ""
    inp = payload.get("tool_input") or {}
    if not isinstance(inp, dict):
        inp = {}
    event = payload.get("hook_event_name")
    if event == "UserPromptSubmit":
        return "", clip(payload.get("prompt") or "", 200)
    if event == "Stop":
        return "", clip(payload.get("last_assistant_message") or "", 300)
    if event == "SessionStart":
        return "", str(payload.get("source") or "")
    if event == "SessionEnd":
        return "", str(payload.get("reason") or "")
    if event in ("SubagentStart", "SubagentStop"):
        return "", str(payload.get("agent_type") or "")
    if name == "Bash":
        return name, clip(inp.get("description") or inp.get("command") or "", 160)
    if name in ("Read", "Edit", "Write", "MultiEdit", "NotebookEdit"):
        return name, clip(inp.get("file_path") or inp.get("notebook_path") or "", 160)
    if name in ("Agent", "Task"):
        return name, clip(f"{inp.get('subagent_type') or ''} {inp.get('description') or ''}".strip(), 160)
    if name == "Skill":
        return name, clip(inp.get("skill") or "", 100)
    if name in ("Grep", "Glob"):
        return name, clip(inp.get("pattern") or "", 120)
    return name, ""


def find_job(root, *texts):
    """A job id mentioned in the text that really exists under factory/jobs/, else gx-<name> for a GraphOS workspace."""
    for text in texts:
        for rx in (JOB_IN_PATH, JOB_IN_COMMAND):
            for m in rx.finditer(text or ""):
                if os.path.isdir(os.path.join(root, "factory", "jobs", m.group(1))):
                    return m.group(1)
    # A GraphOS workspace has no job.json; its id here is gx-<folder name>.
    for text in texts:
        for m in GX_IN_COMMAND.finditer(text or ""):
            return "gx-" + m.group(1)
        for m in GX_IN_PATH.finditer(text or ""):
            if os.path.isdir(os.path.join(root, "graphos", m.group(1))):
                return "gx-" + m.group(1)
    return None


def build_event(payload, root):
    event = EVENTS.get(payload.get("hook_event_name"))
    if not event:
        return None
    prompt = payload.get("prompt") or ""
    if event == "prompt" and prompt.startswith("<agent-message"):
        return None  # a subagent hand-back, not something a person typed
    if payload.get("tool_name") == "SubagentHandback":
        return None  # internal plumbing between a subagent and its caller
    tool, text = summarize(payload)
    raw = json.dumps(payload.get("tool_input") or "", default=str) + " " + prompt + " " + str(payload.get("cwd") or "")
    entry = {
        "ts": now_iso(),
        "sid": payload.get("session_id") or "unknown",
        "ev": event,
        "agent": payload.get("agent_type") or "orchestrator",
        "tool": tool,
        "text": redact(text),
        "job": find_job(root, raw),
    }
    if payload.get("duration_ms") is not None:
        entry["ms"] = payload["duration_ms"]
    pid = host_pid()
    if pid:
        entry["pid"] = pid
    return entry


def record(payload, root):
    """Append one event. The session's job is sticky: once an event names a job, later
    events of that session without a name belong to it too."""
    entry = build_event(payload, root)
    if not entry:
        return None
    directory = activity_dir(root)
    os.makedirs(directory, exist_ok=True)
    sticky = os.path.join(directory, f"{re.sub(r'[^A-Za-z0-9_.-]', '_', entry['sid'])}.job")
    if entry["job"]:
        with open(sticky, "w", encoding="utf-8") as fh:
            fh.write(entry["job"])
    elif os.path.isfile(sticky):
        with open(sticky, encoding="utf-8") as fh:
            entry["job"] = fh.read().strip() or None
    path = os.path.join(directory, f"{re.sub(r'[^A-Za-z0-9_.-]', '_', entry['sid'])}.jsonl")
    line = (json.dumps(entry, ensure_ascii=False) + "\n").encode("utf-8")
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
    try:
        os.write(fd, line)  # one write: short lines append atomically
    finally:
        os.close(fd)
    return entry


def cmd_record(args):
    try:
        payload = json.load(sys.stdin)
        record(payload, project_root())
    except Exception:  # a logger must never break a session
        pass
    return 0


# --------------------------------------------------------------------------- reading

def read_events(root):
    directory = activity_dir(root)
    events = []
    if not os.path.isdir(directory):
        return events
    for name in sorted(os.listdir(directory)):
        if not name.endswith(".jsonl"):
            continue
        with open(os.path.join(directory, name), encoding="utf-8") as fh:
            for line in fh:
                try:
                    events.append(json.loads(line))
                except ValueError:
                    continue  # a half-written last line
    events.sort(key=lambda e: e.get("ts", ""))
    return events


def format_event(e):
    t = e.get("ts", "")[11:19]
    job = e.get("job") or "-"
    who = e.get("agent", "")
    what = {
        "session_start": "session started",
        "session_end": "session ended",
        "prompt": "prompt",
        "stop": "finished turn",
        "subagent_start": "agent started",
        "subagent_stop": "agent finished",
        "tool_done": "done",
        "tool": e.get("tool", ""),
    }.get(e.get("ev"), e.get("ev", ""))
    if e.get("ev") == "tool_done":
        what = f"done {e.get('tool', '')}" + (f" {e['ms']}ms" if e.get("ms") is not None else "")
    return f"{t}  {job:<24} {who:<18} {what:<14} {e.get('text', '')}".rstrip()


def select(events, job=None, last=None):
    if job:
        events = [e for e in events if e.get("job") == job]
    return events[-last:] if last else events


def cmd_feed(args):
    root = project_root(args.project)
    seen = set()

    def emit(batch):
        for e in batch:
            key = (e.get("ts"), e.get("sid"), e.get("ev"), e.get("tool"), e.get("text"))
            if key in seen:
                continue
            seen.add(key)
            print(json.dumps(e, ensure_ascii=False) if args.json else format_event(e), flush=True)

    emit(select(read_events(root), args.job, args.last))
    while args.follow:
        time.sleep(1)
        emit(select(read_events(root), args.job, 500))
    return 0


def session_states(events, stall_minutes, at=None, alive=pid_alive):
    """One record per session: state, agent, job, age of the last event."""
    at = at or datetime.now(timezone.utc)
    sessions = {}
    for e in events:
        sessions.setdefault(e.get("sid"), []).append(e)
    out = []
    for sid, evs in sessions.items():
        last = evs[-1]
        job = next((e["job"] for e in reversed(evs) if e.get("job")), None)
        age = (at - parse_ts(last["ts"])).total_seconds()
        pid = next((e["pid"] for e in reversed(evs) if e.get("pid")), None)
        if last["ev"] == "session_end":
            state = "ended"
        elif pid and not alive(pid):
            state = "crashed"  # the process died without a clean end: killed, crashed or machine restart
        elif last["ev"] == "stop":
            state = "idle"  # the turn finished; the session is waiting or done
        elif age > stall_minutes * 60:
            state = "stalled"
        else:
            state = "running"
        out.append({
            "session": sid, "state": state, "job": job, "agent": last.get("agent"),
            "last": last.get("text") or last.get("tool") or last["ev"],
            "last_ts": last["ts"], "age_seconds": int(age), "events": len(evs), "pid": pid,
        })
    out.sort(key=lambda s: s["last_ts"], reverse=True)
    return out


def cmd_status(args):
    root = project_root(args.project)
    states = session_states(read_events(root), args.stall_minutes)
    if args.line:
        counts = {k: sum(1 for x in states if x["state"] == k) for k in ("running", "stalled", "crashed")}
        parts = [f"{n} {k}" for k, n in counts.items() if n]
        print("factory: " + (" · ".join(parts) if parts else "quiet"))
        return 0
    if args.json:
        print(json.dumps(states, indent=2))
        return 0
    if not states:
        print("No activity recorded yet.")
        return 0
    for s in states:
        age = f"{s['age_seconds'] // 60}m" if s["age_seconds"] >= 60 else f"{s['age_seconds']}s"
        print(f"{s['state']:<8} {s['job'] or '-':<24} {s['agent']:<18} {age:>5} ago  {s['last'][:60]}")
        if s["state"] == "stalled" and s["job"]:
            print(f"         no activity for over {args.stall_minutes}m. In Claude Code: /factory resume {s['job']}")
        if s["state"] == "crashed" and s["job"]:
            print(f"         the session's process is gone. In Claude Code: /factory resume {s['job']}")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--project", help="repo root (default: CLAUDE_PROJECT_DIR or the current directory)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("record")
    f = sub.add_parser("feed")
    f.add_argument("--job")
    f.add_argument("-n", "--last", type=int, default=40)
    f.add_argument("-f", "--follow", action="store_true")
    f.add_argument("--json", action="store_true")
    s = sub.add_parser("status")
    s.add_argument("--json", action="store_true")
    s.add_argument("--line", action="store_true", help="one short line, for a status line")
    s.add_argument("--stall-minutes", type=int, default=int(os.environ.get("FACTORY_STALL_MINUTES", STALL_MINUTES)))
    args = parser.parse_args(argv)
    return {"record": cmd_record, "feed": cmd_feed, "status": cmd_status}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
