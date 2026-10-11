#!/usr/bin/env python3
"""Check that a repo is ready for the factory. Exit 1 if anything FAILs.

  doctor.py [--repo .] [--json]

The agents carry nothing repo-specific, so everything they need to know must be in
AGENTS.md (or CLAUDE.md). This checks that file covers what the factory relies on,
and that the factory itself is wired up: policy, hooks, gitignore, git state.
A WARN is worth fixing; a FAIL means jobs will misbehave.
"""

import argparse
import json
import os
import re
import subprocess
import sys

TOPICS = [  # (name, level if missing, regexes any of which satisfies it)
    ("setup for a fresh checkout", "FAIL", [r"\binstall\b", r"\bsetup\b", r"\bnpm (ci|install)\b", r"pip install", r"\bbundle install\b", r"\bgo mod\b", r"\bmake\b"]),
    ("how to run the tests", "FAIL", [r"\btests?\b.*(`|:)", r"\bpytest\b", r"\bnpm (run )?test\b", r"\bunittest\b", r"\bgo test\b", r"\bcargo test\b", r"\bmvn test\b"]),
    ("build or lint command", "WARN", [r"\bbuild\b", r"\blint\b", r"\bruff\b", r"\beslint\b", r"\bmypy\b", r"\btsc\b"]),
    ("dev server or how to run it, with a port", "WARN", [r"\bport\b", r"localhost:\d+", r"\bdev server\b", r"\bnpm run dev\b", r"\bflask run\b", r"\buvicorn\b"]),
    ("project layout / important paths", "WARN", [r"src/", r"\bapp/", r"\blib/", r"\bpackages/", r"\bpaths?\b", r"\blayout\b", r"\bstructure\b"]),
    ("conventions", "WARN", [r"\bconvention", r"\bstyle\b", r"\bnaming\b", r"\bprefer\b", r"\balways\b", r"\bnever\b", r"\bdo not\b", r"\bdon't\b"]),
    ("what not to touch", "WARN", [r"\bdo not (edit|touch|modify)\b", r"\bnever (edit|touch|modify)\b", r"\bfrozen\b", r"\bgenerated\b", r"\bvendor"]),
]


def run(repo, *cmd):
    return subprocess.run(cmd, cwd=repo, capture_output=True, text=True, check=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--repo", default=".")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    repo = os.path.abspath(args.repo)
    rows = []

    def add(level, name, detail=""):
        rows.append({"level": level, "check": name, "detail": detail})

    doc = next((os.path.join(repo, n) for n in ("AGENTS.md", "CLAUDE.md") if os.path.isfile(os.path.join(repo, n))), None)
    if not doc:
        add("FAIL", "AGENTS.md or CLAUDE.md exists", "none found; run /factory init to draft one")
    else:
        text = open(doc, encoding="utf-8", errors="ignore").read()
        lines = len(text.splitlines())
        add("PASS" if lines >= 10 else "FAIL", "project doc is not a stub", f"{os.path.basename(doc)}: {lines} lines")
        add("PASS" if lines <= 400 else "WARN", "project doc is short enough to be read in full", f"{lines} lines (aim for under 400; link to docs instead)")
        for name, level, pats in TOPICS:
            ok = any(re.search(p, text, re.I) for p in pats)
            add("PASS" if ok else level, f"project doc covers: {name}")
        if re.search(r"(api[_-]?key|secret|password|token)\s*[:=]\s*\S{12,}", text, re.I):
            add("FAIL", "project doc holds no secrets", "looks like a credential")

    git_ok = run(repo, "git", "rev-parse", "--git-dir").returncode == 0
    add("PASS" if git_ok else "FAIL", "repo is a git repository")
    if git_ok:
        branch = run(repo, "git", "rev-parse", "--verify", "main").returncode == 0
        add("PASS" if branch else "FAIL", "branch 'main' exists", "jobs branch from and merge to main")
        dirty = run(repo, "git", "status", "--porcelain", "--untracked-files=no").stdout.strip()
        add("PASS" if not dirty else "WARN", "main checkout has no uncommitted tracked changes", dirty[:120])

    pol = os.path.join(repo, "factory", "policy.json")
    try:
        policy = json.load(open(pol))
        add("PASS", "factory/policy.json is valid JSON")
        for k in ("frozen_paths", "escalate_paths", "blocked_commands", "intent_required"):
            add("PASS" if k in policy else "FAIL", f"policy has {k}")
        if not policy.get("escalate_paths"):
            add("WARN", "policy.escalate_paths is not empty", "list your deploy and CI paths")
    except (OSError, ValueError) as err:
        add("FAIL", "factory/policy.json is valid JSON", str(err))

    settings = os.path.join(repo, ".claude", "settings.json")
    try:
        cfg = json.dumps(json.load(open(settings)))
        add("PASS" if "factory_hooks.py" in cfg else "FAIL", "settings.json wires the factory hooks")
    except (OSError, ValueError):
        add("FAIL", "settings.json wires the factory hooks", ".claude/settings.json missing or invalid")

    try:
        helpers = json.load(open(os.path.join(repo, "factory", "skills", "helper-skills.json")))["skills"]
        missing = [n for n in helpers if not os.path.isfile(os.path.join(repo, ".claude", "skills", n, "SKILL.md"))]
        add("PASS" if not missing else "WARN", "helper skills installed (tdd, code-review, ...)",
            "missing: " + ", ".join(missing) + "; run factory/scripts/install_helper_skills.py --apply" if missing else "")
    except (OSError, ValueError):
        add("WARN", "helper skills installed", "factory/skills/helper-skills.json missing")

    ignore = open(os.path.join(repo, ".gitignore"), encoding="utf-8").read() if os.path.isfile(os.path.join(repo, ".gitignore")) else ""
    add("PASS" if "factory/jobs" in ignore else "WARN", ".gitignore ignores factory/jobs", "see .gitignore.factory")
    add("PASS" if run(repo, "python3", "--version").returncode == 0 else "FAIL", "python3 is available (hooks need it)")
    claude = run(repo, "claude", "--version")
    add("PASS" if claude.returncode == 0 else "FAIL", "claude CLI is available", claude.stdout.strip()[:40])
    managed = any(os.path.isfile(os.path.join(d, "managed-settings.d", "50-software-factory.json"))
                  for d in ("/etc/claude-code", "/Library/Application Support/ClaudeCode"))
    add("PASS" if managed else "WARN", "hooks installed as managed settings", "otherwise anyone with repo access can disable them; see factory/managed/install.py")

    if args.json:
        print(json.dumps(rows, indent=2))
    else:
        for r in rows:
            print(f"{r['level']:4} {r['check']}" + (f"  [{r['detail']}]" if r["detail"] and r["level"] != "PASS" else ""))
        counts = {k: sum(1 for r in rows if r["level"] == k) for k in ("PASS", "WARN", "FAIL")}
        print(f"\n{counts['PASS']} pass, {counts['WARN']} warn, {counts['FAIL']} fail")
    sys.exit(1 if any(r["level"] == "FAIL" for r in rows) else 0)


if __name__ == "__main__":
    main()
