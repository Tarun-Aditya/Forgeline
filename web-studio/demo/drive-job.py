#!/usr/bin/env python3
"""Run one /factory command through the Forgeline web app's API and wait until no run is active.

Usage: drive-job.py "<text>"        e.g.  drive-job.py "Add a priority to tasks ..."
                                          drive-job.py "/factory accept 001-task-priority"
Env:   FORGELINE_URL (default http://127.0.0.1:3000)

This is what the Send / Accept / Approve buttons do. Use it to run a REAL job against a repo (the web app
must be running with FORGELINE_REPOS=<repo>) so that demo/build-fixtures.py can turn it into a replay.
"""
import json, os, sys, time, urllib.request
BASE = os.environ.get("FORGELINE_URL", "http://127.0.0.1:3000")
def post(text):
    body = json.dumps({"messages": [{"id": "m", "role": "user", "parts": [{"type": "text", "text": text}]}]}).encode()
    req = urllib.request.Request(BASE + "/api/chat", body, {"content-type": "application/json", "origin": BASE})
    urllib.request.urlopen(req, timeout=5).close()
def get(p):
    return json.load(urllib.request.urlopen(BASE + p, timeout=10))
def wait_idle():
    time.sleep(5)
    while any(r["status"] == "running" for r in get("/api/runs")["runs"]):
        time.sleep(5)
    r = get("/api/runs")["runs"]
    print({k: r[0].get(k) for k in ("status", "costUsd")}, flush=True)
if __name__ == "__main__":
    post(sys.argv[1]); wait_idle()
