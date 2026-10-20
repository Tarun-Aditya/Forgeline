#!/usr/bin/env python3
"""Make a fresh worktree usable: link or copy what git does not carry, then run setup commands.

  worktree_setup.py <worktree> [--main .] [--policy factory/policy.json]

A new git worktree holds only tracked files. An existing repo usually also needs untracked
ones (node_modules, a virtualenv, .env.test) and an install step before its tests can run.
policy.json:

  "worktree_setup": {
    "link": ["node_modules", "packages/*/node_modules", ".venv"],
    "copy": [".env.test"],
    "commands": ["pnpm install --offline --frozen-lockfile"]
  }

`link` makes symlinks to the main checkout's copy (fast, shared); `copy` copies; `commands`
run in the worktree through the shell, in order, and the first failure stops everything.
Paths must be relative and stay inside the repo. The merge gate runs this on its trial
checkouts too, so verify_commands see the same environment the builder had.
Exit 0 on success, 1 on a failed command or a bad path.
"""

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from factory_lib import load_policy  # noqa: E402


def apply(main, worktree, setup):
    """Returns (ok, notes). `setup` is the policy's worktree_setup dict."""
    notes = []
    main, worktree = os.path.realpath(main), os.path.realpath(worktree)
    for kind in ("link", "copy"):
        for pattern in (setup or {}).get(kind) or []:
            if os.path.isabs(pattern) or ".." in pattern.replace("\\", "/").split("/"):
                return False, [f"worktree_setup.{kind}: {pattern!r} must be a relative path inside the repo"]
            for src in sorted(glob.glob(os.path.join(main, pattern))):
                rel = os.path.relpath(src, main)
                dst = os.path.join(worktree, rel)
                if os.path.lexists(dst):
                    continue
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                if kind == "link":
                    os.symlink(src, dst)
                elif os.path.isdir(src):
                    shutil.copytree(src, dst, symlinks=True)
                else:
                    shutil.copy2(src, dst)
                notes.append(f"{kind}: {rel}")
    for cmd in (setup or {}).get("commands") or []:
        done = subprocess.run(cmd, shell=True, cwd=worktree, capture_output=True, text=True, check=False)
        if done.returncode != 0:
            return False, notes + [f"setup command failed ({done.returncode}): {cmd}: " + (done.stdout + done.stderr).strip()[-300:]]
        notes.append(f"ran: {cmd}")
    return True, notes


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("worktree")
    ap.add_argument("--main", default=".")
    ap.add_argument("--policy")
    args = ap.parse_args()
    pol = args.policy or os.path.join(args.main, "factory", "policy.json")
    setup = (load_policy(pol) if os.path.isfile(pol) else {}).get("worktree_setup")
    ok, notes = apply(args.main, args.worktree, setup)
    print(json.dumps({"ok": ok, "notes": notes}, indent=2))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
