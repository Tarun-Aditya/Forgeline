"""Deterministic detection for the maintain loop. Standard library only.

No model is involved here. A metric's recent points are tested against a baseline
(mean and standard deviation of the older points) with Western Electric style
rules, and the result is a tier:

  log       the metric is drifting or sitting above its normal range: record it
  diagnose  a clear excursion: a read-only agent diagnoses it
  act       a severe excursion: propose a fix through the review gate, and
            optionally run a pre-approved runbook
  none / insufficient-data

Rules, with k the sigma multiple for the tier (plus any dismissal bump):
  act       the latest point is beyond the act multiple (default 3 sigma)
  diagnose  2 of the last 3 points are beyond 2 sigma, same side
  log       4 of the last 5 points are beyond 1 sigma, same side, or
            the last 8 points are all on the same side of the mean
"""

import json
import statistics

TIER_ORDER = {"none": 0, "log": 1, "diagnose": 2, "act": 3}
RECENT = 8  # points held out of the baseline and tested by the rules


def read_series(path):
    """JSON lines of {"t": <time>, "v": <number>}, in time order."""
    points = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                row = json.loads(line)
                points.append((row["t"], float(row["v"])))
    return points


def _sides(direction):
    return {"high": (1,), "low": (-1,), "both": (1, -1)}[direction]


def evaluate(points, window=30, min_points=10, direction="high", bump=0.0,
             min_abs_delta=0.0, tiers=None):
    tiers = tiers or {"log": 1.0, "diagnose": 2.0, "act": 3.0}
    if len(points) < RECENT + min_points:
        return {"tier": "insufficient-data", "rules": [], "points": len(points)}

    values = [v for _, v in points]
    baseline = values[:-RECENT][-window:]
    mean = statistics.fmean(baseline)
    sigma = max(statistics.stdev(baseline), 1e-9)

    def z(v):
        return 0.0 if abs(v - mean) < min_abs_delta else (v - mean) / sigma

    zs = [z(v) for v in values[-RECENT:]]
    k1, k2, k3 = (tiers[n] + bump for n in ("log", "diagnose", "act"))
    sides = _sides(direction)
    fired = {}

    for side in sides:
        beyond = lambda x, k: x * side > k  # noqa: E731
        if beyond(zs[-1], k3):
            fired.setdefault("act", []).append(f"latest point beyond {k3:g} sigma")
        if sum(beyond(x, k2) for x in zs[-3:]) >= 2:
            fired.setdefault("diagnose", []).append(f"2 of last 3 points beyond {k2:g} sigma")
        if sum(beyond(x, k1) for x in zs[-5:]) >= 4:
            fired.setdefault("log", []).append(f"4 of last 5 points beyond {k1:g} sigma")
        if all(x * side > 0 for x in zs):
            fired.setdefault("log", []).append("last 8 points all on the same side of the mean")

    tier = max(fired, key=TIER_ORDER.get) if fired else "none"
    return {
        "tier": tier,
        "rules": [r for t in sorted(fired, key=TIER_ORDER.get, reverse=True) for r in fired[t]],
        "mean": round(mean, 6),
        "sigma": round(sigma, 6),
        "latest": {"t": points[-1][0], "v": points[-1][1], "z": round(zs[-1], 2)},
        "points": len(points),
    }
