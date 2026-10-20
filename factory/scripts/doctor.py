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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import monorepo  # noqa: E402
from factory_lib import base_branch  # noqa: E402

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
        try:
            pol_base = json.load(open(os.path.join(repo, "factory", "policy.json")))
        except (OSError, ValueError):
            pol_base = {}
        base = base_branch(repo, pol_base)
        branch = run(repo, "git", "rev-parse", "--verify", base).returncode == 0
        add("PASS" if branch else "FAIL", f"base branch '{base}' exists",
            f"jobs branch from and merge to {base}; set base_branch in policy.json if that is wrong")
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

    try:
        pol_doc = json.load(open(pol))
    except (OSError, ValueError):
        pol_doc = {}
    pkgs = monorepo.detect(repo, pol_doc)
    if pkgs:
        mp = pol_doc.get("merge_policy") or {}
        add("PASS", "monorepo detected", f"{len(pkgs)} packages: " + ", ".join(p["path"] for p in pkgs[:6]) + ("..." if len(pkgs) > 6 else ""))
        bare = [p["path"] for p in pkgs if not p["verify_commands"]]
        if bare:
            add("WARN" if not mp.get("require_verify") else "FAIL", "every package has verify_commands in policy.packages",
                "missing for: " + ", ".join(bare[:6]) + "; run monorepo.py detect --snippet")
        else:
            add("PASS", "every package has verify_commands in policy.packages")
        add("PASS" if mp.get("require_verify") else "WARN", "merge_policy.require_verify is on",
            "without it a package with no tests merges unchecked")
        if doc and not re.search(r"\bpackages?\b|\bworkspaces?\b|\bmonorepo\b", text, re.I):
            add("WARN", "project doc describes the packages", "say which package to run commands from and how they depend on each other")
        undoc = [p["path"] for p in pkgs if not any(os.path.isfile(os.path.join(repo, p["path"], n)) for n in ("AGENTS.md", "CLAUDE.md"))]
        if undoc and len(undoc) == len(pkgs):
            add("WARN", "packages have their own AGENTS.md", "none do; agents read the nearest one, so add one where a package's commands differ")
    manifests = [m for m in ("package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "Gemfile", "pom.xml")
                 if os.path.isfile(os.path.join(repo, m))] or ([p["path"] for p in pkgs][:1])
    if manifests:
        setup = pol_doc.get("worktree_setup") or {}
        has = any(setup.get(k) for k in ("link", "copy", "commands"))
        add("PASS" if has else "WARN", "policy.worktree_setup prepares a fresh worktree (dependencies, .env)",
            "" if has else "a new worktree has no node_modules, virtualenv or .env; the builder and the merge gate's trial checkout "
                           "need them. Add link/copy/commands to policy.json")
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

    docs = ""
    for name in ("AGENTS.md", "CLAUDE.md"):
        if os.path.isfile(os.path.join(repo, name)):
            docs += open(os.path.join(repo, name), encoding="utf-8").read()
    if re.search(r"localhost:\d+|--port\b|\bPORT=|npm run dev|flask run|uvicorn|next dev|vite", docs):
        have = os.path.isfile(os.path.join(repo, ".claude", "skills", "verify-app", "SKILL.md"))
        add("PASS" if have else "WARN", "verify-app skill exists (the app has a dev server)",
            "" if have else "reviewer-ux and reviewer-ui need it; run /factory init, read VERIFY.proposed.md, move it to .claude/skills/verify-app/SKILL.md")

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
