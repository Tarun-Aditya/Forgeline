#!/usr/bin/env python3
"""Factory metrics from the job.json files.

  metrics.py [--factory factory] [--json]

Leading: time spent in each stage, time from first stage to merge.
Lagging: first-pass rate (merged with one review round and no rework), average
review rounds, spec rework rate (specs sent back by a human), escalation rate.

Jobs made before timestamps existed have no history; they count in the totals
but not in the timings.
"""

import argparse
import json
import os
import statistics
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from factory_lib import STAGES  # noqa: E402


def parse(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def load_jobs(factory):
    jobs_dir = os.path.join(factory, "jobs")
    out = []
    if not os.path.isdir(jobs_dir):
        return out
    for name in sorted(os.listdir(jobs_dir)):
        path = os.path.join(jobs_dir, name, "job.json")
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as fh:
                out.append(json.load(fh))
    return out


def stage_seconds(job):
    """Seconds spent in each stage, from the history of stage changes."""
    history = job.get("history") or []
    totals = {}
    for cur, nxt in zip(history, history[1:]):
        secs = (parse(nxt["at"]) - parse(cur["at"])).total_seconds()
        totals[cur["stage"]] = totals.get(cur["stage"], 0) + secs
    return totals


def human(secs):
    if secs is None:
        return "n/a"
    secs = int(secs)
    if secs < 3600:
        return f"{secs // 60}m"
    if secs < 86400:
        return f"{secs / 3600:.1f}h"
    return f"{secs / 86400:.1f}d"


def summarize(jobs):
    merged = [j for j in jobs if j["stage"] == "merged"]
    finished = [j for j in jobs if j["stage"] in ("merged", "needs-human")]
    first_pass = [j for j in merged if j.get("round", 0) <= 1 and not j.get("reworks")]

    cycle = []
    per_stage = {s: [] for s in STAGES}
    for j in jobs:
        for stage, secs in stage_seconds(j).items():
            if stage in per_stage:
                per_stage[stage].append(secs)
        history = j.get("history") or []
        if j["stage"] == "merged" and len(history) > 1:
            cycle.append((parse(history[-1]["at"]) - parse(history[0]["at"])).total_seconds())

    def rate(n, d):
        return None if not d else round(100 * n / d)

    rounds = [j.get("round", 0) for j in jobs if j.get("round", 0) > 0]
    return {
        "jobs": len(jobs),
        "merged": len(merged),
        "needs_human": sum(1 for j in jobs if j["stage"] == "needs-human"),
        "in_flight": sum(1 for j in jobs if j["stage"] not in ("merged", "needs-human")),
        "first_pass_rate_pct": rate(len(first_pass), len(merged)),
        "avg_review_rounds": round(statistics.mean(rounds), 2) if rounds else None,
        "spec_rework_rate_pct": rate(sum(1 for j in jobs if j.get("respecs")), len(jobs)),
        "escalation_rate_pct": rate(sum(1 for j in finished if j["stage"] == "needs-human"), len(finished)),
        "median_cycle_seconds": statistics.median(cycle) if cycle else None,
        "median_stage_seconds": {
            s: statistics.median(v) for s, v in per_stage.items() if v
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--factory", default="factory")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    summary = summarize(load_jobs(args.factory))
    if args.json:
        print(json.dumps(summary, indent=2))
        return

    def pct(v):
        return "n/a" if v is None else f"{v}%"

    print(f"Jobs: {summary['jobs']}  merged {summary['merged']}  "
          f"needs-human {summary['needs_human']}  in flight {summary['in_flight']}")
    print(f"First-pass rate:      {pct(summary['first_pass_rate_pct'])}")
    print(f"Avg review rounds:    {summary['avg_review_rounds'] if summary['avg_review_rounds'] is not None else 'n/a'}")
    print(f"Spec rework rate:     {pct(summary['spec_rework_rate_pct'])}")
    print(f"Escalation rate:      {pct(summary['escalation_rate_pct'])}")
    print(f"Median cycle time:    {human(summary['median_cycle_seconds'])}")
    print("Median time in stage:")
    for stage in STAGES:
        secs = summary["median_stage_seconds"].get(stage)
        if secs is not None:
            print(f"  {stage:<14}{human(secs)}")


if __name__ == "__main__":
    main()
