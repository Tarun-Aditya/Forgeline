#!/usr/bin/env python3
"""Collect real metrics into the files the maintain loop watches.

  collect.py [--factory factory] [--now ISO] [--only NAME]

Reads collectors.json and appends one {"t": time, "v": number} row to
metrics/<name>.jsonl for each collector that is due. Run it just before run.py
(from cron, see schedule.py). A collector that fails is reported and skipped; it
never stops the others and never writes a made-up value.

Collector kinds (set "kind" in collectors.json):
  command    run an argv list (no shell); the first number on stdout is the value
  http_json  GET a URL and read a number at a dotted path; "headers_env" maps a
             header name to an environment variable holding its value, so no
             secret sits in the file
  log_rate   share of lines matching "match" among lines matching "total" in the
             last "window_minutes" of a log whose lines start with an ISO time
  git        "what": commits_per_day | reverts_per_day over the last "days" days
  factory    job cycle times, via collect_factory.py

Common keys: "metric" (the name in bands.json) and "min_interval_seconds"
(skip if the last row is newer, default 300).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from maintain_lib import iso, load_json, now_utc, parse_time  # noqa: E402

NUM = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")


def first_number(text):
    m = NUM.search(text)
    if not m:
        raise ValueError("no number in output")
    return float(m.group(0))


def kind_command(c, ctx):
    out = subprocess.run(c["argv"], capture_output=True, text=True, timeout=c.get("timeout", 60), check=False, cwd=ctx["repo"])
    if out.returncode != 0:
        raise ValueError(f"exit {out.returncode}: {(out.stderr or out.stdout)[-120:]}")
    return first_number(out.stdout)


def kind_http_json(c, ctx):
    if not c["url"].startswith(("http://", "https://")):
        raise ValueError("url must be http or https")
    req = urllib.request.Request(c["url"])
    for header, env in (c.get("headers_env") or {}).items():
        val = os.environ.get(env)
        if not val:
            raise ValueError(f"environment variable {env} is not set")
        req.add_header(header, val)
    with urllib.request.urlopen(req, timeout=c.get("timeout", 30)) as resp:
        data = json.load(resp)
    for key in c["path"].split("."):
        data = data[int(key)] if isinstance(data, list) else data[key]
    return float(data)


def kind_log_rate(c, ctx):
    path = c["file"] if os.path.isabs(c["file"]) else os.path.join(ctx["repo"], c["file"])
    cutoff = ctx["now"] - timedelta(minutes=c.get("window_minutes", 15))
    total = match = 0
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            stamp = line.split(None, 1)[0] if line.strip() else ""
            try:
                if parse_time(stamp) < cutoff:
                    continue
            except ValueError:
                continue
            if re.search(c["total"], line):
                total += 1
                if re.search(c["match"], line):
                    match += 1
    if total < c.get("min_total", 1):
        raise ValueError(f"only {total} matching lines in the window")
    return match / total


def kind_git(c, ctx):
    days = c.get("days", 1)
    since = f"{days}.days.ago"
    args = ["git", "-C", ctx["repo"], "log", f"--since={since}", "--format=%s", "--first-parent", c.get("branch", "main")]
    out = subprocess.run(args, capture_output=True, text=True, check=False)
    if out.returncode != 0:
        raise ValueError(out.stderr.strip()[:120])
    subjects = [l for l in out.stdout.splitlines() if l.strip()]
    if c["what"] == "reverts_per_day":
        subjects = [s for s in subjects if s.lower().startswith("revert")]
    elif c["what"] != "commits_per_day":
        raise ValueError("what must be commits_per_day or reverts_per_day")
    return len(subjects) / days


KINDS = {"command": kind_command, "http_json": kind_http_json, "log_rate": kind_log_rate, "git": kind_git}


def last_time(path):
    if not os.path.isfile(path):
        return None
    last = None
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                last = json.loads(line)["t"]
    return parse_time(last) if last else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--factory", default="factory")
    ap.add_argument("--now")
    ap.add_argument("--only")
    args = ap.parse_args()
    maintain = os.path.join(args.factory, "maintain")
    cfg = load_json(os.path.join(maintain, "collectors.json"))
    if not cfg:
        sys.exit(f"error: no collectors.json in {maintain}")
    ctx = {"repo": os.path.dirname(os.path.abspath(args.factory)), "now": parse_time(args.now) if args.now else now_utc()}
    results, failed = [], 0
    for name, c in cfg["collectors"].items():
        if args.only and args.only != name:
            continue
        if c.get("disabled"):
            results.append({"collector": name, "status": "disabled"})
            continue
        metric = c.get("metric", name)
        path = os.path.join(maintain, "metrics", f"{metric}.jsonl")
        if c["kind"] == "factory":
            done = subprocess.run([sys.executable, "-I", os.path.join(HERE, "collect_factory.py"), "--factory", args.factory],
                                  capture_output=True, text=True, check=False)
            results.append({"collector": name, "status": "ran" if done.returncode == 0 else "failed", "detail": done.stdout.strip()})
            failed += done.returncode != 0
            continue
        prev = last_time(path)
        if prev and (ctx["now"] - prev).total_seconds() < c.get("min_interval_seconds", 300):
            results.append({"collector": name, "status": "not-due"})
            continue
        try:
            fn = KINDS[c["kind"]]
        except KeyError:
            results.append({"collector": name, "status": "failed", "detail": f"unknown kind {c['kind']!r}"})
            failed += 1
            continue
        try:
            value = fn(c, ctx)
        except Exception as err:  # one bad source must not stop the rest
            results.append({"collector": name, "status": "failed", "detail": f"{type(err).__name__}: {err}"[:200]})
            failed += 1
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"t": iso(ctx["now"]), "v": value}) + "\n")
        results.append({"collector": name, "status": "collected", "value": value})
    print(json.dumps(results, indent=2))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
