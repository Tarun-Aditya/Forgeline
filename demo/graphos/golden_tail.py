#!/usr/bin/env python3
"""Carry on from where golden.py stopped, until the workspace reaches Export and is exported.

golden.py ends after the v2 re-apply. A real re-apply can raise a new question or leave a validation layer unproven; this drives
the rest the way a person would, and appends every step to golden-steps.json, so the recording stays one true story:

  - open decisions: answered (golden.pick)
  - the next step is an agent's: Run next step (/graphos continue)
  - validation has no live result: the live check
  - a layer failed or the review asks for changes: have the author fix it
  - Export reached: export

  python3 demo/graphos/golden_tail.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import golden as g  # noqa: E402

PATH = os.path.join(g.HERE, "golden-steps.json")
doc = json.load(open(PATH))
g.STEPS[:] = doc["steps"]
g.OUT[0] = PATH
n = doc["workspace"]
LIVE = "/graphos validate %s --live-url http://127.0.0.1:4010 --env LUMEN_TOKEN" % n


def done_verbs():
    return [s["prompt"] for s in g.STEPS if s.get("prompt")]


for i in range(8):
    w = g.ws(n)
    st = w["state"]
    print("state:", st["stage"], "gate" if st["gate"] else "", st["reason"][:90], flush=True)
    if st["exported"]:
        break
    open_d = [d for d in w["decisions"] if d["status"] == "open" and d.get("phase") != "scope"]
    live = (st.get("evidence") or {}).get("layers", {}).get("live")
    if open_d:
        g.act("answer the open decisions")
        g.STEPS[-1]["note"] = "%d decisions" % g.answer_all(n, "tail")
    elif st["stage"] == "export":
        if live != "pass" and LIVE not in done_verbs()[-2:]:
            g.step("live check again", "live", LIVE)
        elif st.get("review") == "CHANGES" and not any(p.startswith("/graphos fix") and i > 0 for p in done_verbs()[-1:]):
            g.step("apply the review again", "fix", '/graphos fix %s "Apply the should-fix items in review.md that the decisions allow, then re-run validation."' % n)
        else:
            g.step("export", "export", "/graphos export %s --base-url https://api.lumenbooks.example" % n)
    elif st["next"]:
        g.step("apply and validate again", "reapply", "/graphos continue %s" % n)
    elif st["stage"] == "validate" and st["gate"]:
        g.step("fix the failed layer", "fix", '/graphos fix %s "Resolve what fails validation: for a read gap the decisions already accept, record the waiver the skill describes; then re-run validation."' % n)
    else:
        raise SystemExit("stuck: " + json.dumps(st)[:300])
print("tail done")
