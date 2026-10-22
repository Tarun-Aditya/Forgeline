#!/usr/bin/env python3
"""Run the whole GraphOS story once for real, through the web app's API, and log every step.

It makes the same calls the UI makes, so the Git history it leaves in graphos/<name>/, the run logs in the web
app's data folder and the hook-written activity are exactly what demo/graphos/build_fixtures.py replays for the
video. It uses the Claude subscription (several runs, roughly an hour) and needs:

  - the web app running on WEB (default http://localhost:3000) with FORGELINE_ELV2_ACCEPTED=1 and LUMEN_TOKEN set
  - the demo API running on :4010 (python3 demo/graphos/server.py)

  python3 demo/graphos/golden.py [--out demo/graphos/golden-steps.json]

Every decision is answered here the way a person would: the agent's recommendation, except where the table below
makes a deliberate choice so the demo shows something (entities, links, a kept deprecated operation).
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

WEB = os.environ.get("WEB", "http://localhost:3000")
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
HAND_EDIT = json.load(open(os.path.join(HERE, "hand-edit.json")))

# Deliberate choices, by a word in the decision's title. Each value lists words; a choice is picked when its id or label has one.
# `all` picks every choice of a multiple-choice decision.
PICKS = [
    ("mutations", ["all"]),
    ("personal data", ["hide"]),
    ("apikey", ["exclude"]),
    ("credential", ["exclude"]),
    ("payment", ["hide-iban", "hide iban", "iban"]),
    ("relationship", ["book-author", "orderitem-book"]),
    ("links", ["book-author", "orderitem-book"]),
    ("entities", ["catalog"]),
    ("isbn", ["isbn13", "mark"]),
    ("search", ["keep", "q"]),
    ("reviews", ["leave", "out"]),
    ("orderstatus", ["add"]),
    ("patch", ["refund"]),
    ("updateorder", ["refund"]),
]


def restart_api(version):
    """The upstream team ships a new version: restart the demo API as v%d."""
    subprocess.run(["pkill", "-f", "demo/graphos/server.py"], check=False)
    time.sleep(1)
    subprocess.Popen(["python3", os.path.join(HERE, "server.py"), "--port", "4010", "--api-version", str(version)],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    time.sleep(1.5)


def call(path, body=None, method=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(WEB + path, data=data, method=method or ("POST" if body is not None else "GET"),
                                 headers={"content-type": "application/json", "Origin": WEB})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit("HTTP %s on %s: %s" % (e.code, path, e.read()[:300]))


def runs():
    return call("/api/runs")["runs"]


def wait_idle(timeout=3600):
    end = time.time() + timeout
    time.sleep(6)
    while time.time() < end:
        if all(r["status"] != "running" for r in runs()):
            return
        time.sleep(5)
    raise SystemExit("timed out waiting for a run")


STEPS = []
OUT = [None]


def save(name=None):
    """Written after every step, so a run that stops half way still leaves what happened."""
    if OUT[0]:
        json.dump({"workspace": name or "lumen_books", "steps": STEPS, "handEdit": HAND_EDIT}, open(OUT[0], "w"), indent=2)


def step(name, kind, prompt=None, note=""):
    """Run one command through /api/runs and wait for it. Records start and end for the fixture builder."""
    t0 = time.time()
    rid = call("/api/runs", {"text": prompt})["runId"]
    wait_idle()
    r = next(x for x in runs() if x["runId"] == rid)
    STEPS.append({"name": name, "kind": kind, "prompt": prompt, "runId": rid, "start": t0, "end": time.time(), "status": r["status"], "costUsd": r.get("costUsd"), "note": note})
    print("%-34s %-6s $%s  %ds" % (name, r["status"], r.get("costUsd"), time.time() - t0), flush=True)
    save()
    if r["status"] != "ok":
        raise SystemExit("run failed: " + str(r.get("message"))[:500])
    return r


def act(name, note=""):
    """A step a person does in the UI (not a run). Logged so the video can place it."""
    STEPS.append({"name": name, "kind": "ui", "start": time.time(), "end": time.time(), "note": note})
    print("%-34s (you)" % name, flush=True)
    save()


def ws(name):
    return call("/api/graphos/" + name)


def pick(d):
    """A person's answer: the deliberate choice if the table has one, else the agent's recommendation.
    A multiple-choice question gets every choice the recommendation names (all of them if it names none)."""
    ids = [c["id"] for c in d["choices"]]
    labels = {c["id"]: (c["id"] + " " + c["label"]).lower() for c in d["choices"]}
    for word, wants in PICKS:
        if word.lower() in d["title"].lower() or word.lower() in (d.get("question") or "").lower():
            if wants == ["all"]:
                return [i for i in ids if i.lower() not in ("none", "no", "skip")]
            hit = [i for i in ids if any(re.search(r"\b" + re.escape(w), labels[i]) for w in wants)]
            if hit:
                return hit if d.get("multiple") else hit[:1]
    rec = (re.search(r"Recommendation:\s*([^\n]*)", d.get("context") or "") or [None, ""])[1].lower()
    named = [i for i in ids if re.search(r"(?<![\w-])" + re.escape(i.lower()) + r"(?![\w-])", rec)]
    if d.get("multiple"):
        return named or ids
    return named[:1] or ids[:1]


def answer_all(name, phase_note):
    n = 0
    while True:
        w = ws(name)
        todo = [d for d in w["decisions"] if d["status"] == "open" and d.get("phase") != "scope"]
        if not todo:
            return n
        d = todo[0]
        chosen = pick(d)
        call("/api/graphos/" + name, {"action": "resolve", "id": d["id"], "chosen": chosen, "note": "demo answer"})
        n += 1
        print("   answered %-12s %-52s -> %s" % (d["id"], d["title"][:52], ",".join(chosen)), flush=True)


def hand_edit(name):
    path = os.path.join(REPO, "graphos", name, HAND_EDIT["file"])
    text = open(path, encoding="utf-8").read().split("\n")
    for i, line in enumerate(text):
        if HAND_EDIT["find"] in line and not line.rstrip().endswith(HAND_EDIT["append"].strip()):
            text[i] = line.rstrip() + HAND_EDIT["append"]
            open(path, "w", encoding="utf-8").write("\n".join(text))
            return
    raise SystemExit("hand edit: line not found")


def drive_to_export(n):
    """A real re-apply can raise a new question or leave the live layer unrun. Do what a person would, until the workspace is
    validated, live-checked and ready to export: answer questions, apply them, run the live check."""
    live = "/graphos validate %s --live-url http://127.0.0.1:4010 --env LUMEN_TOKEN" % n
    for _ in range(8):
        w = ws(n)
        st = w["state"]
        open_d = [d for d in w["decisions"] if d["status"] == "open" and d.get("phase") != "scope"]
        layers = (st.get("evidence") or {}).get("layers") or {}
        print("   state:", st["stage"], "gate" if st["gate"] else "", st["reason"][:80], flush=True)
        if open_d:
            act("answer the open decisions")
            STEPS[-1]["note"] = "%d decisions" % answer_all(n, "tail")
        elif st["next"]:
            step("apply and validate again", "reapply", "/graphos continue %s" % n)
        elif st["stage"] == "export" and layers.get("live") != "pass":
            step("live check again", "live", live)
        elif st["stage"] == "export":
            return
        else:
            raise SystemExit("stuck: " + json.dumps(st)[:300])
    raise SystemExit("did not reach a validated export")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--out", default=os.path.join(HERE, "golden-steps.json"))
    ap.add_argument("--name", default="lumen_books")
    a = ap.parse_args()
    n = a.name
    OUT[0] = a.out
    if os.path.exists(os.path.join(REPO, "graphos", n)):
        raise SystemExit("graphos/%s already exists; move it away first." % n)

    # 1. docs only: no spec, the agent reads the docs page and probes the live service
    step("docs-only intake", "new-docs", "/graphos new lumen_docs --docs http://127.0.0.1:4010/docs --context generic --env LUMEN_TOKEN")

    # 1b. a tenant-specific API: the agents assess customer-specific fields before authoring
    step("customer-specific intake", "new", "/graphos new lumen_tenant --spec demo/graphos/openapi.v1.json --context specialized")

    # 2. from a spec
    step("new from spec", "new", "/graphos new %s --spec demo/graphos/openapi.v1.json --context generic" % n)
    w = ws(n)
    off = [{"key": o["key"], "include": True} for o in w["operations"] if o["include"] is False]
    call("/api/graphos/" + n, {"action": "selection", "ops": off})
    act("scope: include the rest", "%d operations switched on" % len(off))
    scope = next(d for d in ws(n)["decisions"] if d.get("phase") == "scope")
    call("/api/graphos/" + n, {"action": "resolve", "id": scope["id"], "chosen": [scope["choices"][0]["id"]], "note": "all operations"})
    act("scope: confirm")

    step("design pass", "design", "/graphos continue %s" % n)
    act("design: answer decisions", "")
    answered = answer_all(n, "design")
    STEPS[-1]["note"] = "%d decisions" % answered

    step("apply, validate, review", "apply", "/graphos continue %s" % n)
    step("live check", "live", "/graphos validate %s --live-url http://127.0.0.1:4010 --env LUMEN_TOKEN" % n)
    step("apply the review", "fix", '/graphos fix %s "Apply the should-fix items in review.md that the decisions allow, then re-run validation."' % n)

    w = ws(n)
    reads = [o["key"] for o in w["operations"] if o["include"] and o["method"] == "GET"]
    step("record live traffic", "record", "/graphos record %s %s --env LUMEN_TOKEN" % (n, " ".join(reads)))

    hand_edit(n)
    act("hand edit the schema", HAND_EDIT["append"].strip())
    assert ws(n)["handEdits"], "the skill did not see the hand edit"
    step("codify the hand edit", "codify", "/graphos codify %s" % n)

    # 3. the API changes: serve v2, refresh, answer, apply
    subprocess.run(["python3", os.path.join(HERE, "build_specs.py")], check=True, capture_output=True)
    step("refresh to v2", "refresh", "/graphos refresh %s --spec demo/graphos/openapi.v2.json" % n)
    restart_api(2)
    act("start API v2", "the service the refresh pointed at")
    act("answer the refresh decisions")
    STEPS[-1]["note"] = "%d decisions" % answer_all(n, "refresh")
    step("apply the change", "reapply", "/graphos continue %s" % n)

    drive_to_export(n)
    step("compose with other subgraphs", "compose", "/graphos compose %s --with demo/graphos/others/supergraph.demo.yaml" % n)
    step("export", "export", "/graphos export %s --base-url https://api.lumenbooks.example --live-url http://127.0.0.1:4010 --env LUMEN_TOKEN" % n)
    step("ask the record", "ask", '/graphos ask %s "Why is the customer email not in the schema, and who decided that?"' % n)

    json.dump({"workspace": n, "steps": STEPS, "handEdit": HAND_EDIT}, open(a.out, "w"), indent=2)
    print("done; steps written to", a.out)


if __name__ == "__main__":
    main()
