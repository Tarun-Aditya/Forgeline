#!/usr/bin/env python3
"""Ratchet checks for the merge gate: a measured number must not fall below its baseline.

policy.merge_policy.constraints is a list of
  {"name": "coverage", "command": "python3 -m coverage report", "pattern": "TOTAL.*?(\\d+)%",
   "direction": "min" | "max", "tolerance": 0.5}
and factory/constraints.json in the base checkout holds the numbers a person chose:
  {"baselines": {"coverage": 82}, "exceptions": [{"constraint": "coverage", "owner": "ana",
   "reason": "...", "expires": "2026-12-01"}]}

The baseline file is read from the base checkout, never from the branch, so a job
cannot lower its own bar. A person raises a baseline by editing the file; the gate only
reports when a number has improved. An exception needs an owner and an expiry within
a year; an expired or malformed one is ignored and reported.
"""

import datetime
import json
import os
import re
import shlex
import subprocess

MAX_EXCEPTION_DAYS = 366


def load(base_factory):
    path = os.path.join(base_factory, "constraints.json")
    if not os.path.isfile(path):
        return {"baselines": {}, "exceptions": []}
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return {"baselines": data.get("baselines") or {}, "exceptions": data.get("exceptions") or []}


def valid_exception(exc, name, today):
    """Return (ok, why_not) for one exception entry against constraint `name`."""
    if exc.get("constraint") != name:
        return False, None
    if not str(exc.get("owner", "")).strip() or not str(exc.get("reason", "")).strip():
        return False, f"exception for {name} needs an owner and a reason"
    try:
        expires = datetime.date.fromisoformat(str(exc.get("expires")))
    except ValueError:
        return False, f"exception for {name} has no valid expires date"
    if expires < today:
        return False, f"exception for {name} expired {expires}"
    if (expires - today).days > MAX_EXCEPTION_DAYS:
        return False, f"exception for {name} expires more than a year out ({expires})"
    return True, None


def measure(constraint, cwd):
    """Run the command and read one number. Returns (value, error)."""
    try:
        done = subprocess.run(shlex.split(constraint["command"]), cwd=cwd, capture_output=True, text=True,
                              check=False, timeout=1800)
    except (OSError, subprocess.TimeoutExpired) as err:
        return None, f"{constraint['name']}: could not run the command: {err}"
    text = done.stdout + done.stderr
    if done.returncode != 0:
        return None, f"{constraint['name']}: command failed (exit {done.returncode}): {text.strip()[-200:]}"
    match = re.search(constraint["pattern"], text, re.S)
    if not match:
        return None, f"{constraint['name']}: pattern did not match the command output"
    try:
        return float(match.group(1)), None
    except (IndexError, ValueError):
        return None, f"{constraint['name']}: pattern must capture one number"


def check(constraints, base_factory, trial, today=None):
    """Return (failures, notes, measured) for the merged trial checkout."""
    today = today or datetime.datetime.now(datetime.timezone.utc).date()
    state = load(base_factory)
    failures, notes, measured = [], [], {}
    for exc in state["exceptions"]:
        for c in constraints:
            ok, why = valid_exception(exc, c["name"], today)
            if why:
                notes.append("ignored " + why)
    for c in constraints:
        name = c["name"]
        value, err = measure(c, trial)
        if err:
            failures.append(err)
            continue
        measured[name] = value
        base = state["baselines"].get(name)
        if base is None:
            notes.append(f"{name}: no baseline recorded (measured {value}); add one to factory/constraints.json")
            continue
        tol = float(c.get("tolerance", 0))
        worse = value < base - tol if c.get("direction", "min") == "min" else value > base + tol
        if worse:
            allowed = next((e for e in state["exceptions"] if valid_exception(e, name, today)[0]), None)
            if allowed:
                notes.append(f"{name}: {value} is past the baseline {base}, allowed by {allowed['owner']} until {allowed['expires']}")
            else:
                failures.append(f"{name}: {value} is worse than the baseline {base} (tolerance {tol}) and has no valid exception")
        elif value != base:
            notes.append(f"{name}: {value} is better than the baseline {base}; raise it in factory/constraints.json")
    return failures, notes, measured
