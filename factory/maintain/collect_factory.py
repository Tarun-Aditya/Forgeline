#!/usr/bin/env python3
"""Feed the factory's own job cycle times into the maintain loop.

  collect_factory.py [--factory factory]

Appends one {t, v, job} row to metrics/factory_cycle_seconds.jsonl for every
merged job not already recorded: v is the seconds from the job's first stage to
its merge. The maintain loop then watches for the factory itself slowing down
(PR cycle-time drift). Run it before run.py.
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from maintain_lib import parse_time  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--factory", default="factory")
    args = parser.parse_args()

    out_path = os.path.join(args.factory, "maintain", "metrics", "factory_cycle_seconds.jsonl")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    seen = set()
    if os.path.isfile(out_path):
        with open(out_path, encoding="utf-8") as fh:
            seen = {json.loads(l)["job"] for l in fh if l.strip()}

    jobs_dir = os.path.join(args.factory, "jobs")
    rows = []
    for name in sorted(os.listdir(jobs_dir)) if os.path.isdir(jobs_dir) else []:
        path = os.path.join(jobs_dir, name, "job.json")
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as fh:
            job = json.load(fh)
        history = job.get("history") or []
        if job.get("stage") != "merged" or len(history) < 2 or job["id"] in seen:
            continue
        secs = (parse_time(history[-1]["at"]) - parse_time(history[0]["at"])).total_seconds()
        rows.append({"t": history[-1]["at"], "v": secs, "job": job["id"]})

    rows.sort(key=lambda r: r["t"])
    with open(out_path, "a", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row) + "\n")
    print(f"appended {len(rows)} job(s)")


if __name__ == "__main__":
    main()
