#!/usr/bin/env python3
"""Find who uses the code a change touches. Standard library only.

  callers.py <tree> [--base BRANCH] [--branch HEAD]    symbols a branch removed or edited (base defaults to the repo's)
  callers.py <tree> --files src/a.py,src/b.py          every symbol defined in those files (planning)

`<tree>` is a checkout (a worktree or the main checkout). For each symbol, the report lists
the files that mention it outside the files being changed, and the package each is in.
It is a text search by whole word, so it over-reports (a common name matches unrelated code)
and misses dynamic use (reflection, string lookups, generated code). Read the hits; do not
treat an empty list as proof that nothing else depends on the code.

Prints JSON: {"symbols": {name: {"hits": [...], "truncated": bool}}, "packages": [...],
              "files": [...]}. `packages` is where the hits are, for the merge gate to test.
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

SOURCE = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rs", ".java", ".kt", ".rb",
          ".php", ".cs", ".swift", ".c", ".h", ".cc", ".cpp", ".scala"}
DEFS = [
    re.compile(r"^\s*(?:export\s+)?(?:default\s+)?(?:pub(?:\([\w:]+\))?\s+)?(?:async\s+)?(?:abstract\s+)?"
               r"(?:def|function\*?|class|interface|type|enum|struct|trait|fn|func|const|let|var|val|module|object)\s+([A-Za-z_]\w*)"),
    re.compile(r"^\s*func\s*\([^)]*\)\s*([A-Za-z_]\w*)"),      # Go methods
]
# Names too generic to search for: every hit would be noise.
COMMON = {"main", "init", "test", "tests", "setup", "run", "get", "set", "new", "default", "index", "app", "self",
          "name", "type", "data", "value", "result", "error", "config", "handler", "props", "state", "args",
          "item", "items", "list", "text", "path", "file", "node", "user", "id", "key", "keys", "map", "log",
          "String", "Object", "Array", "Error", "None", "True", "False", "this", "from", "with", "then"}
PER_SYMBOL_CAP = 25
SYMBOL_CAP = 60


def git(tree, *args):
    return subprocess.run(["git", "-C", tree, *args], capture_output=True, text=True, check=False)


def _symbols_in(line):
    for rx in DEFS:
        m = rx.match(line)
        if m:
            return [m.group(1)]
    return []


def diff_symbols(tree, base, branch):
    """(symbols removed or edited, changed source files). Added-only symbols cannot break a caller."""
    files = [f for f in monorepo.changed_files(tree, base, branch) if os.path.splitext(f)[1] in SOURCE]
    if not files:
        return [], []
    patch = git(tree, "diff", "-U0", f"{base}...{branch}", "--", *files).stdout
    syms = []
    for line in patch.splitlines():
        if line.startswith("@@"):
            ctx = line.split("@@", 2)[-1].strip()
            syms += _symbols_in(ctx)          # git names the function a hunk sits in
        elif line.startswith("-") and not line.startswith("---"):
            syms += _symbols_in(line[1:])
    return syms, files


def file_symbols(tree, files):
    syms = []
    for f in files:
        try:
            with open(os.path.join(tree, f), encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    syms += _symbols_in(line.rstrip("\n"))
        except OSError:
            pass
    return syms


def find(tree, symbols, own_files, pkgs):
    """Search the tree for whole-word uses of each symbol outside `own_files`."""
    out, seen_pkgs = {}, set()
    own = set(own_files)
    names = []
    for s in symbols:
        if s not in names and len(s) >= 4 and s not in COMMON:
            names.append(s)
    for sym in names[:SYMBOL_CAP]:
        r = git(tree, "grep", "-n", "-w", "-I", "-F", "-e", sym, "--", ".", ":(exclude)node_modules", ":(exclude)*.lock",
                ":(exclude)*lock.json", ":(exclude)*.min.js")
        hits = []
        for line in r.stdout.splitlines():
            f, _, rest = line.partition(":")
            if f in own or f.startswith("factory/"):
                continue
            ln, _, text = rest.partition(":")
            p = monorepo.owner(f, pkgs)
            hits.append({"file": f, "line": int(ln) if ln.isdigit() else 0, "package": p["name"] if p else None,
                         "text": text.strip()[:100]})
        out[sym] = {"hits": hits[:PER_SYMBOL_CAP], "truncated": len(hits) > PER_SYMBOL_CAP, "total": len(hits)}
        seen_pkgs |= {h["package"] for h in hits if h["package"]}
    return out, sorted(seen_pkgs)


def report(tree, base=None, branch="HEAD", files=None, policy=None):
    pkgs = monorepo.detect(tree, policy)
    if files:
        changed, syms = files, file_symbols(tree, files)
    else:
        syms, changed = diff_symbols(tree, base, branch)
    found, hit_pkgs = find(tree, syms, changed, pkgs)
    return {"files": changed, "symbols": found, "packages": hit_pkgs}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("tree")
    ap.add_argument("--base")
    ap.add_argument("--branch", default="HEAD")
    ap.add_argument("--files", help="comma-separated files (planning mode)")
    ap.add_argument("--policy")
    args = ap.parse_args()
    tree = os.path.abspath(args.tree)
    policy = None
    pol = args.policy or os.path.join(tree, "factory", "policy.json")
    if os.path.isfile(pol):
        policy = json.load(open(pol, encoding="utf-8"))
    base = args.base or (None if args.files else base_branch(tree, policy))
    rep = report(tree, base, args.branch, [f for f in (args.files or "").split(",") if f] or None, policy)
    print(json.dumps(rep, indent=2))


if __name__ == "__main__":
    main()
