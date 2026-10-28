#!/usr/bin/env python3
"""Where a GraphOS workspace stands, and which agent runs next.

  graphos_state.py show <workspace> [--json]
  graphos_state.py list <graphos-dir> [--json]

One place decides the stage, so the /graphos skill and the web board never disagree. It only
reads files (the workspace's .factory/ folder is the skill's own record); it writes nothing and
does not need the graphos-factory binary.

Stages, in order: inventory, scope, design, apply, validate, export.
  gate    true when a person has to act before anything else can run
  next    the agent to run next, or null when a person must act first (or the workspace is done)
  refresh true while a current "Upstream changed" finding is open (the API moved)
  exported true once an "Exported" finding exists for the current evidence
  review  the VERDICT line of review.md (PASS or CHANGES), or null

Markers the agents leave (all through `findings add` / `decisions add`, never by hand):
  decision with phase "scope"        the person confirms the operations they picked
  finding "Design pass complete"     the selector finished asking design questions
  finding "Schema review complete"   the reviewer finished
  finding "Upstream changed: ..."    the reconciler saw the API move; the author supersedes it
  finding "Exported"                 the exporter handed the subgraph over
"""
import argparse
import glob
import json
import os
import re
import sys

# Per the graphos-factory skill these layers report open findings and never block: a failure is shown, not gated on.
NON_GATING = {"write_body_proof", "json_accounting"}
STAGES = ["inventory", "scope", "design", "apply", "validate", "export"]
WHO = {
    "inventory": "graphos-intake",
    "scope": "graphos-selector",
    "design": "graphos-selector",
    "apply": "graphos-author",
    "validate": "graphos-validator",
    "export": "graphos-exporter",
}


def read_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def read_text(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def simple_yaml(text):
    """Top-level `key: value` pairs only. workspace.yaml is flat enough for this."""
    out = {}
    for line in text.splitlines():
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*?)\s*$", line)
        if m and m.group(2) != "":
            out[m.group(1)] = m.group(2).strip("\"'")
    return out


def records(factory, folder, legacy, key):
    """Records of a log: the legacy file's list plus one file per record under the folder."""
    out = []
    old = read_json(os.path.join(factory, legacy))
    if isinstance(old, dict):
        out += old.get(key + "s") or []
    for p in sorted(glob.glob(os.path.join(factory, folder, "*.json"))):
        doc = read_json(p)
        if isinstance(doc, dict) and isinstance(doc.get(key), dict):
            out.append(doc[key])
    return out


def selection_counts(factory):
    """How many operations selection.yaml includes or leaves out (line scan; flow and block forms)."""
    text = read_text(os.path.join(factory, "selection.yaml"))
    if not text:
        return None
    inc = exc = 0
    in_ops = False
    for line in text.splitlines():
        if re.match(r"^\S", line):  # a top-level key: only the operations: section counts (links: has its own include flags)
            in_ops = line.startswith("operations:")
            continue
        if not in_ops:
            continue
        if re.match(r"^\s+(\"?[a-z]+:/[^\s]*\"?:)", line) or re.match(r"^\s{2}[a-z]+:/", line):
            m = re.search(r"include:\s*(true|false)", line)
            if m:
                inc, exc = (inc + 1, exc) if m.group(1) == "true" else (inc, exc + 1)
            continue
        m = re.match(r"^\s{4}include:\s*(true|false)\s*$", line)
        if m:
            inc, exc = (inc + 1, exc) if m.group(1) == "true" else (inc, exc + 1)
    return {"included": inc, "excluded": exc}


def evidence_summary(factory):
    ev = read_json(os.path.join(factory, "evidence", "latest.json"))
    if not isinstance(ev, dict):
        return None
    layers = {k: (v or {}).get("status", "unknown") for k, v in (ev.get("layers") or {}).items()}
    return {
        "run_at": ev.get("run_at"),
        "layers": layers,
        "failed": sorted(k for k, s in layers.items() if s == "fail"),
        "blocking": sorted(k for k, s in layers.items() if s == "fail" and k not in NON_GATING),
        "not_run": sorted(k for k, s in layers.items() if s in ("not_run", "skipped")),
    }


def answered_since_apply(factory):
    """Decisions a person answered after the last apply wrote its lock: the schema has not seen them yet."""
    lock = os.path.join(factory, "applied.lock.yaml")
    if not os.path.isfile(lock):
        return 0
    since = os.path.getmtime(lock)
    n = 0
    for p in glob.glob(os.path.join(factory, "decisions", "*.json")):
        doc = read_json(p)
        d = doc.get("decision") if isinstance(doc, dict) else None
        if isinstance(d, dict) and d.get("status") == "resolved" and (d.get("resolution") or {}).get("by") == "user" and os.path.getmtime(p) > since + 1:
            n += 1
    return n


def show(ws):
    ws = os.path.abspath(ws)
    factory = os.path.join(ws, ".factory")
    meta = simple_yaml(read_text(os.path.join(factory, "workspace.yaml")))
    if not meta:
        return {"error": "not a GraphOS workspace (no .factory/workspace.yaml)", "path": ws}
    inv = read_json(os.path.join(factory, "inventory.json"))
    ops_total = len(inv.get("operations", [])) if isinstance(inv, dict) else 0
    sel = selection_counts(factory)
    decisions = records(factory, "decisions", "decisions.json", "decision")
    findings = [f for f in records(factory, "findings", "findings.json", "finding") if f.get("status", "current") == "current"]
    titles = [str(f.get("title", "")) for f in findings]
    open_d = [d for d in decisions if d.get("status") == "open"]
    scope_open = [d for d in open_d if d.get("phase") == "scope"]
    scope_any = [d for d in decisions if d.get("phase") == "scope"]
    design_open = [d for d in open_d if d.get("phase") != "scope"]
    design_done = "Design pass complete" in titles
    reviewed = "Schema review complete" in titles
    review = read_text(os.path.join(ws, "review.md"))
    verdict = (re.search(r"^VERDICT:\s*(\w+)", review, re.M) or [None, None])[1]
    verdict = verdict.upper() if verdict else None
    exported = "Exported" in titles
    refresh = any(t.startswith("Upstream changed") for t in titles)
    applied = os.path.isfile(os.path.join(factory, "applied.lock.yaml"))
    evidence = evidence_summary(factory)
    pending = answered_since_apply(factory)

    stage, gate, reason = "inventory", False, "No inventory yet."
    if not inv:
        pass
    elif sel is None or not scope_any:
        stage, reason = "scope", "Draft the operation list for you to pick from."
    elif scope_open:
        stage, gate, reason = "scope", True, "Pick the operations to include, then confirm the scope."
    elif not design_done:
        stage, reason = "design", "Work out the design questions."
    elif design_open:
        stage, gate, reason = "design", True, "%d design decision(s) need your answer." % len(design_open)
    elif not applied or refresh or pending:
        stage = "apply"
        reason = "Apply the API change to the schema." if refresh else ("Apply your %d new answer(s) to the schema." % pending if applied else "Write the subgraph schema.")
    elif evidence is None:
        stage, reason = "validate", "Run the validation layers."
    elif evidence["blocking"]:
        stage, gate, reason = "validate", True, "Failed: " + ", ".join(evidence["blocking"]) + ". Fix or accept the gap."
    elif not reviewed:
        stage, reason = "validate", "Review the schema."
    else:
        stage, gate = "export", True
        if exported:
            reason = "Exported."
        elif verdict == "CHANGES":
            reason = "Validated, but the review asks for changes. Have the author apply them, or export anyway."
        else:
            reason = "Validated. Export when you are ready."

    nxt = None if gate or (stage == "export") else WHO[stage]
    if stage == "validate" and evidence and not evidence["blocking"] and not reviewed:
        nxt = "graphos-reviewer"
    if stage == "export" and not exported:
        nxt = None  # the person asks for the export
    return {
        "path": ws,
        "name": os.path.basename(ws),
        "service": meta.get("service"),
        "intake": meta.get("intake"),
        "source_kind": meta.get("source_kind"),
        "context_mode": meta.get("context_mode"),
        "ops_total": ops_total,
        "selection": sel,
        "decisions": {"open": len(open_d), "resolved": len([d for d in decisions if d.get("status") == "resolved"])},
        "evidence": evidence,
        "review": verdict,
        "stage": stage,
        "gate": gate,
        "next": nxt,
        "reason": reason,
        "refresh": refresh,
        "exported": exported,
    }


def list_all(root):
    out = []
    if os.path.isdir(root):
        for name in sorted(os.listdir(root)):
            p = os.path.join(root, name)
            if os.path.isfile(os.path.join(p, ".factory", "workspace.yaml")):
                out.append(show(p))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("cmd", choices=["show", "list"])
    ap.add_argument("path")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    data = show(a.path) if a.cmd == "show" else {"workspaces": list_all(a.path)}
    if a.json:
        print(json.dumps(data, indent=2))
    elif a.cmd == "show":
        if "error" in data:
            sys.exit(data["error"])
        print("%s  stage=%s%s  next=%s\n  %s" % (data["name"], data["stage"], " (needs you)" if data["gate"] else "", data["next"], data["reason"]))
    else:
        for w in data["workspaces"]:
            print("%-24s %-9s %s" % (w["name"], w["stage"], "needs you" if w["gate"] else (w["next"] or "")))


if __name__ == "__main__":
    main()
