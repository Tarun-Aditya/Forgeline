#!/usr/bin/env python3
"""Recurring security scans. Run them on a schedule (weekly is a good start), not once.

  scan.py run [--lens security|quality|secrets|dependencies|all] [--paths src lib] [--claude claude]
                                                     scan, validate, write the report
  scan.py report <scan-id>                           print a scan's report
  scan.py triage <scan-id> <finding-id> accept       queue the finding as a backlog item
  scan.py triage <scan-id> <finding-id> dismiss --reason "..."

Lenses: security and quality use a read-only agent (scanner-security, scanner-quality);
secrets and dependencies are deterministic scripts (scan_lenses.py) that need no model.
`all` runs every lens as its own scan. `run` has the agent write findings.json, then checks it
mechanically so an invented finding cannot slip through: the file must exist, the
line must be in range, and the quoted evidence must appear in the file (if it does
not, the finding is kept but its confidence drops to low). It marks each finding
new, recurring or previously dismissed, and writes report.md sorted by severity.

`triage accept` appends a line to factory/backlog.md, so /factory next builds the fix
through the normal loop and review gate. `triage dismiss` needs a reason and is
remembered, so the same finding is not raised again.

This complements static analysis and dependency scanning; it does not replace them.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from maintain_lib import iso, load_json, now_utc, save_json  # noqa: E402
from scan_lenses import LENSES  # noqa: E402

SEVERITIES = ["critical", "high", "medium", "low"]
CONFIDENCES = ["high", "medium", "low"]
REQUIRED = ["id", "class", "title", "severity", "confidence", "file", "line", "evidence", "why", "fix"]
SCAN_TOOLS = "Read,Grep,Glob,Bash(git ls-files *),Bash(git log *),Bash(git show *),Write(factory/maintain/scans/**),Edit(factory/maintain/scans/**)"


def fingerprint(f):
    key = f"{f['class']}|{f['file']}|{re.sub(r'\s+', ' ', f['title'].lower())}"
    return hashlib.sha1(key.encode()).hexdigest()[:12]


def collapse(text):
    return re.sub(r"\s+", " ", text).strip()


def validate(raw, repo):
    """Return (valid findings, rejected [(finding or text, reason)])."""
    good, bad, seen = [], [], set()
    if not isinstance(raw, list):
        return [], [("findings.json", "top level is not a list")]
    for item in raw:
        if not isinstance(item, dict) or any(k not in item for k in REQUIRED):
            bad.append((item, "missing required fields"))
            continue
        if item["severity"] not in SEVERITIES or item["confidence"] not in CONFIDENCES:
            bad.append((item, "unknown severity or confidence"))
            continue
        if item["id"] in seen:
            bad.append((item, "duplicate id"))
            continue
        seen.add(item["id"])
        if item.get("history"):  # found in git history by a script; the file may no longer exist
            item["evidence_verified"] = True
            item["fingerprint"] = fingerprint(item)
            good.append(item)
            continue
        path = os.path.normpath(os.path.join(repo, item["file"]))
        if os.path.isabs(item["file"]) or not path.startswith(os.path.abspath(repo) + os.sep) or not os.path.isfile(path):
            bad.append((item, "file does not exist in the repo"))
            continue
        with open(path, encoding="utf-8", errors="ignore") as fh:
            text = fh.read()
        if not isinstance(item["line"], int) or not 1 <= item["line"] <= len(text.splitlines()):
            bad.append((item, "line is out of range"))
            continue
        evidence = collapse(item["evidence"])
        if evidence.endswith("..."):  # a secret is shown by its first characters only
            evidence = evidence[:-3].rstrip()
        item["evidence_verified"] = len(evidence) >= 6 and evidence in collapse(text)
        if not item["evidence_verified"]:
            item["confidence"] = "low"
        item["fingerprint"] = fingerprint(item)
        good.append(item)
    return good, bad


def rank(f):
    return (SEVERITIES.index(f["severity"]), CONFIDENCES.index(f["confidence"]), f["id"])


def write_report(folder, scan_id, findings, rejected, dismissed, lens="security"):
    open_f = sorted((f for f in findings if f["fingerprint"] not in dismissed), key=rank)
    done_f = sorted((f for f in findings if f["fingerprint"] in dismissed), key=rank)
    lines = [f"# {lens.capitalize()} scan {scan_id}", "",
             f"{len(open_f)} open finding(s), {len(done_f)} previously dismissed, {len(rejected)} rejected by validation.", ""]
    for f in open_f:
        tag = "recurring" if f.get("status") == "recurring" else "new"
        ver = "evidence verified" if f["evidence_verified"] else "evidence NOT found in the file, confidence lowered"
        lines += [f"## {f['id']} [{f['severity']}] {f['title']}",
                  f"- Confidence: {f['confidence']} ({ver}); {tag}",
                  f"- Where: `{f['file']}:{f['line']}`  Class: {f['class']}",
                  f"- Evidence: `{f['evidence']}`", f"- Why it matters: {f['why']}", f"- Fix: {f['fix']}", ""]
    if done_f:
        lines += ["## Previously dismissed", ""]
        lines += [f"- {f['id']} {f['title']} (`{f['file']}:{f['line']}`): {dismissed[f['fingerprint']]}" for f in done_f]
        lines.append("")
    if rejected:
        lines += ["## Rejected by validation", ""]
        lines += [f"- {(r[0] or {}).get('id', '?') if isinstance(r[0], dict) else '?'}: {r[1]}" for r in rejected]
        lines.append("")
    with open(os.path.join(folder, "report.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


AGENT_LENSES = {"security": "scanner-security", "quality": "scanner-quality"}


def run_one(args, lens):
    maintain = os.path.join(args.factory, "maintain")
    repo = os.path.dirname(os.path.abspath(args.factory))
    stamp = now_utc()
    scan_id = stamp.strftime("%Y%m%dT%H%M%S") + ("" if lens == "security" else f"-{lens}")
    folder = os.path.join(maintain, "scans", scan_id)
    os.makedirs(folder)
    path = os.path.join(folder, "findings.json")
    if lens in LENSES:
        try:
            raw = LENSES[lens](repo)
        except Exception as err:
            sys.exit(f"error: lens {lens} failed: {err}")
        save_json(path, raw)
    else:
        focus = f" Focus on: {', '.join(args.paths)}." if args.paths else ""
        prompt = (f"Run a {lens} scan. Scan folder: factory/maintain/scans/{scan_id}/. "
                  f"Write findings to factory/maintain/scans/{scan_id}/findings.json.{focus}")
        cmd = [args.claude, "-p", prompt, "--agent", AGENT_LENSES[lens], "--permission-mode", "dontAsk",
               "--allowedTools", SCAN_TOOLS, "--output-format", "json", "--no-session-persistence"]
        try:
            out = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, timeout=args.timeout, check=False)
        except (OSError, subprocess.TimeoutExpired) as err:
            sys.exit(f"error: scanner did not run: {err}")
        if not os.path.isfile(path):
            sys.exit(f"error: the scanner wrote no findings.json. {(out.stdout or out.stderr)[-300:]}")
    try:
        raw = json.load(open(path, encoding="utf-8"))
    except ValueError as err:
        sys.exit(f"error: findings.json is not valid JSON: {err}")

    findings, rejected = validate(raw, repo)
    dismissed = load_json(os.path.join(maintain, "scans", "dismissed.json"), {})
    previous = set()
    for name in sorted(os.listdir(os.path.join(maintain, "scans"))):
        if not os.path.isdir(os.path.join(maintain, "scans", name)):
            continue
        triage = load_json(os.path.join(maintain, "scans", name, "triage.json"))
        if triage and name != scan_id:
            previous |= set(triage["findings"])
    for f in findings:
        f["status"] = "recurring" if f["fingerprint"] in previous else "new"
    triage = {"scan": scan_id, "lens": lens, "at": iso(stamp),
              "findings": {f["fingerprint"]: {"id": f["id"], "triage": "open"} for f in findings}}
    save_json(os.path.join(folder, "findings.validated.json"), findings)
    save_json(os.path.join(folder, "triage.json"), triage)
    write_report(folder, scan_id, findings, rejected, {k: v["reason"] for k, v in dismissed.items()}, lens)
    open_n = sum(1 for f in findings if f["fingerprint"] not in dismissed)
    print(f"scan {scan_id} ({lens}): {len(findings)} valid finding(s), {open_n} open, {len(rejected)} rejected")
    print(f"report: {os.path.join(folder, 'report.md')}")


def cmd_run(args):
    lenses = ["security", "quality", "secrets", "dependencies"] if args.lens == "all" else [args.lens]
    for lens in lenses:
        run_one(args, lens)
        if len(lenses) > 1:
            import time
            time.sleep(1.05)  # scan ids are timestamps


def cmd_report(args):
    path = os.path.join(args.factory, "maintain", "scans", args.scan_id, "report.md")
    if not os.path.isfile(path):
        sys.exit(f"error: no report for {args.scan_id}")
    print(open(path, encoding="utf-8").read())


def cmd_triage(args):
    maintain = os.path.join(args.factory, "maintain")
    folder = os.path.join(maintain, "scans", args.scan_id)
    findings = load_json(os.path.join(folder, "findings.validated.json"))
    triage = load_json(os.path.join(folder, "triage.json"))
    if findings is None:
        sys.exit(f"error: no such scan {args.scan_id}")
    finding = next((f for f in findings if f["id"] == args.finding_id), None)
    if not finding:
        sys.exit(f"error: no finding {args.finding_id} in scan {args.scan_id}")
    entry = triage["findings"][finding["fingerprint"]]
    if entry["triage"] != "open":
        sys.exit(f"error: already {entry['triage']}")

    if args.action == "dismiss":
        if not args.reason or len(args.reason.strip()) < 5:
            sys.exit("error: dismissing needs a real reason; it is kept in the record")
        dpath = os.path.join(maintain, "scans", "dismissed.json")
        dismissed = load_json(dpath, {})
        dismissed[finding["fingerprint"]] = {"reason": args.reason.strip(), "at": iso(now_utc()),
                                             "scan": args.scan_id, "id": args.finding_id}
        save_json(dpath, dismissed)
        entry["triage"] = "dismissed"
        print(f"dismissed {args.finding_id}; it will not be raised again")
    else:
        backlog = os.path.join(args.factory, "backlog.md")
        item = (f"- [ ] Fix {finding['severity']} security finding: {finding['title']} "
                f"({finding['file']}:{finding['line']}) [scan {args.scan_id} {finding['id']}]")
        existing = open(backlog, encoding="utf-8").read() if os.path.isfile(backlog) else "# Backlog\n\n"
        if f"[scan {args.scan_id} {finding['id']}]" in existing:
            sys.exit("error: this finding is already in the backlog")
        with open(backlog, "w", encoding="utf-8") as fh:
            fh.write(existing.rstrip("\n") + "\n" + item + "\n")
        entry["triage"] = "accepted"
        print(f"queued in backlog.md: {item}")
    save_json(os.path.join(folder, "triage.json"), triage)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--factory", default="factory")
    sub = parser.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--lens", default="security", choices=["security", "quality", "secrets", "dependencies", "all"])
    r.add_argument("--paths", nargs="*")
    r.add_argument("--claude", default="claude")
    r.add_argument("--timeout", type=int, default=1800)
    r.set_defaults(fn=cmd_run)
    p = sub.add_parser("report")
    p.add_argument("scan_id")
    p.set_defaults(fn=cmd_report)
    t = sub.add_parser("triage")
    t.add_argument("scan_id")
    t.add_argument("finding_id")
    t.add_argument("action", choices=["accept", "dismiss"])
    t.add_argument("--reason")
    t.set_defaults(fn=cmd_triage)
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
