#!/usr/bin/env python3
"""Dismiss a breach, with a reason. A dismissal widens that metric's bands.

  dismiss.py <breach-id> --reason "Planned load test, not an incident"

Every dismissal needs a reason, which is kept with the breach. It also raises the
metric's sigma multiples by `dismissal_bump` (up to `max_bump`), so a metric that
keeps crying wolf gets quieter and a real excursion still fires. Remove the bump
by editing the metric's entry in state.json.
"""

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from maintain_lib import iso, load_json, load_state, now_utc, save_json, save_state  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("breach_id")
    parser.add_argument("--reason", required=True)
    parser.add_argument("--factory", default="factory")
    args = parser.parse_args()

    if len(args.reason.strip()) < 5:
        sys.exit("error: give a real reason; dismissals are kept in the record")
    maintain = os.path.join(args.factory, "maintain")
    path = os.path.join(maintain, "breaches", args.breach_id, "breach.json")
    breach = load_json(path)
    if breach is None:
        sys.exit(f"error: no such breach {args.breach_id}")
    if breach["status"] == "dismissed":
        sys.exit("error: already dismissed")

    cfg = load_json(os.path.join(maintain, "bands.json"))
    state = load_state(maintain)
    entry = state["metrics"].setdefault(breach["metric"], {})
    old = entry.get("bump", 0.0)
    entry["bump"] = min(cfg["max_bump"], old + cfg["dismissal_bump"])
    breach.update(status="dismissed", dismissed_at=iso(now_utc()), dismissed_reason=args.reason.strip())
    save_json(path, breach)
    save_state(maintain, state)
    print(f"dismissed {args.breach_id}; {breach['metric']} bands widened by {entry['bump'] - old:g} "
          f"(total bump {entry['bump']:g})")


if __name__ == "__main__":
    main()
