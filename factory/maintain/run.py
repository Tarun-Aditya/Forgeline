#!/usr/bin/env python3
"""Run the maintain loop once. Schedule it (cron, a Claude scheduled task, a CI
schedule); each run is stateless apart from state.json.

  run.py [--factory factory] [--diagnose] [--open-intents] [--execute-runbooks]

1. Detect (deterministic): test every metric in bands.json against its baseline.
2. Record: write each breach to breaches/<id>/breach.json. A cooldown stops the
   same tier firing again within cooldown_hours; a higher tier fires at once.
3. Respond by tier:
     log       recorded only
     diagnose  with --diagnose, a read-only agent writes diagnosis.md
     act       also writes incident.md; with --open-intents, `/factory intent`
               turns it into an intent that waits for a human to accept; the
               metric's runbook is shown, and runs only with --execute-runbooks
               when it is pre_approved and a person set FACTORY_RELEASE_AUTHORIZED=1
Nothing here merges, deploys or pushes. A person triages each breach:
fix now (accept the intent), schedule, or dismiss with dismiss.py.

  --claude CMD   the Claude Code executable (default: claude)
  --now ISO      treat this as the current time (for tests)
  --dry-run      detect and print, write nothing
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from detect import TIER_ORDER, evaluate, read_series  # noqa: E402
from maintain_lib import iso, load_json, load_state, now_utc, parse_time, save_json, save_state  # noqa: E402

DIAGNOSE_TOOLS = "Read,Grep,Glob,Bash(git log *),Bash(git diff *),Bash(git show *),Write(factory/maintain/breaches/**),Edit(factory/maintain/breaches/**)"
INTENT_TOOLS = "Read,Grep,Glob,Write,Edit,Agent,Task,Bash(python3 *),Bash(git rev-parse *)"


def run_claude(claude, prompt, tools, cwd, agent=None, timeout=900):
    cmd = [claude, "-p", prompt, "--permission-mode", "dontAsk", "--allowedTools", tools,
           "--output-format", "json", "--no-session-persistence"]
    if agent:
        cmd += ["--agent", agent]
    try:
        out = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as err:
        return False, str(err)
    return out.returncode == 0, (out.stdout or out.stderr)[-2000:]


def should_fire(entry, tier, now, cooldown_hours):
    if not entry:
        return True
    if TIER_ORDER[tier] > TIER_ORDER.get(entry.get("last_tier", "none"), 0):
        return True
    return now - parse_time(entry["last_at"]) >= timedelta(hours=cooldown_hours)


def incident_text(breach, diagnosis_path):
    ev = breach["evaluation"]
    lines = [
        f"Incident: {breach['metric']} breached its band ({breach['tier']} tier)",
        "",
        f"- Detected: {breach['detected_at']}",
        f"- Latest value: {ev['latest']['v']} at {ev['latest']['t']} ({ev['latest']['z']} sigma from the mean)",
        f"- Baseline: mean {ev['mean']}, standard deviation {ev['sigma']}, {ev['points']} points",
        "- Rules fired: " + "; ".join(ev["rules"]),
        f"- Metric: {breach['description'] or breach['metric']}",
        f"- Breach record: factory/maintain/breaches/{breach['id']}/breach.json",
    ]
    if diagnosis_path and os.path.isfile(diagnosis_path):
        with open(diagnosis_path, encoding="utf-8") as fh:
            lines += ["", "Diagnosis from the read-only diagnoser:", "", fh.read().strip()]
    return "\n".join(lines) + "\n"


def handle_runbook(breach, cfg_metric, runbooks, execute):
    name = cfg_metric.get("runbook")
    if not name:
        return None
    rb = runbooks.get(name)
    if not rb:
        return {"name": name, "status": "missing", "detail": "no such runbook in runbooks.json"}
    result = {"name": name, "command": rb["command"], "pre_approved": bool(rb.get("pre_approved"))}
    if not execute:
        result["status"] = "dry-run"
    elif not rb.get("pre_approved"):
        result["status"] = "not-run"
        result["detail"] = "runbook is not marked pre_approved"
    elif os.environ.get("FACTORY_RELEASE_AUTHORIZED") != "1":
        result["status"] = "not-run"
        result["detail"] = "FACTORY_RELEASE_AUTHORIZED=1 was not set by a person"
    else:
        done = subprocess.run(rb["command"], capture_output=True, text=True, check=False)
        result.update(status="ran" if done.returncode == 0 else "failed", exit_code=done.returncode,
                      output=(done.stdout or done.stderr)[-500:])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--factory", default="factory")
    parser.add_argument("--diagnose", action="store_true")
    parser.add_argument("--open-intents", action="store_true")
    parser.add_argument("--execute-runbooks", action="store_true")
    parser.add_argument("--claude", default="claude")
    parser.add_argument("--now")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    maintain = os.path.join(args.factory, "maintain")
    repo = os.path.dirname(os.path.abspath(args.factory))
    cfg = load_json(os.path.join(maintain, "bands.json"))
    if not cfg:
        sys.exit(f"error: no bands.json in {maintain}")
    runbooks = load_json(os.path.join(maintain, "runbooks.json"), {})
    state = load_state(maintain)
    now = parse_time(args.now) if args.now else now_utc()
    summary = []

    for name, mcfg in cfg["metrics"].items():
        path = os.path.join(maintain, mcfg["file"])
        if not os.path.isfile(path):
            summary.append({"metric": name, "tier": "no-data"})
            continue
        entry = state["metrics"].setdefault(name, {})
        result = evaluate(
            read_series(path), window=cfg["window"], min_points=cfg["min_points"],
            direction=mcfg.get("direction", "high"), bump=entry.get("bump", 0.0),
            min_abs_delta=mcfg.get("min_abs_delta", 0.0), tiers=cfg["tiers"],
        )
        tier = result["tier"]
        row = {"metric": name, "tier": tier}
        if tier in ("none", "insufficient-data"):
            summary.append(row)
            continue
        if not should_fire(entry if entry.get("last_at") else None, tier, now, cfg["cooldown_hours"]):
            row["suppressed"] = "cooldown"
            summary.append(row)
            continue

        breach_id = f"{now.strftime('%Y%m%dT%H%M%S')}-{name}"
        breach = {"id": breach_id, "metric": name, "tier": tier, "detected_at": iso(now),
                  "description": mcfg.get("description", ""), "evaluation": result, "status": "open"}
        row["breach"] = breach_id
        row["rules"] = result["rules"]
        if args.dry_run:
            summary.append(row)
            continue

        folder = os.path.join(maintain, "breaches", breach_id)
        diagnosis = os.path.join(folder, "diagnosis.md")
        save_json(os.path.join(folder, "breach.json"), breach)

        if TIER_ORDER[tier] >= TIER_ORDER["diagnose"] and args.diagnose:
            ok, detail = run_claude(
                args.claude,
                f"Diagnose the breach recorded in factory/maintain/breaches/{breach_id}/breach.json. "
                f"Write your diagnosis to factory/maintain/breaches/{breach_id}/diagnosis.md.",
                DIAGNOSE_TOOLS, repo, agent="diagnoser")
            row["diagnosis"] = "written" if ok and os.path.isfile(diagnosis) else f"failed: {detail[:200]}"

        if tier == "act":
            with open(os.path.join(folder, "incident.md"), "w", encoding="utf-8") as fh:
                fh.write(incident_text(breach, diagnosis))
            rb = handle_runbook(breach, mcfg, runbooks, args.execute_runbooks)
            if rb:
                breach["runbook"] = rb
                row["runbook"] = rb["status"]
                save_json(os.path.join(folder, "breach.json"), breach)
            if args.open_intents:
                jobs_dir = os.path.join(args.factory, "jobs")
                before = set(os.listdir(jobs_dir)) if os.path.isdir(jobs_dir) else set()
                ok, detail = run_claude(
                    args.claude,
                    "/factory intent incident: create the job with --feature-file "
                    f"factory/maintain/breaches/{breach_id}/incident.md and use that file's contents "
                    "verbatim as the raw text.",
                    INTENT_TOOLS, repo)
                new = (set(os.listdir(jobs_dir)) if os.path.isdir(jobs_dir) else set()) - before
                # A zero exit code is not proof: check that a job folder really appeared.
                if ok and new:
                    row["intent"] = "opened: " + ", ".join(sorted(new))
                    breach["intent_job"] = sorted(new)[0]
                    save_json(os.path.join(folder, "breach.json"), breach)
                else:
                    row["intent"] = "failed: no job was created. " + detail[:200]

        entry.update(last_tier=tier, last_at=iso(now))
        summary.append(row)

    if not args.dry_run:
        save_state(maintain, state)
        log = os.path.join(maintain, "log.jsonl")
        with open(log, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"at": iso(now), "results": summary}) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
