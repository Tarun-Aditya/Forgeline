#!/usr/bin/env python3
"""Install the helper skills the factory agents use (tdd, diagnosing-bugs, ...).

  install_helper_skills.py [--apply] [--force] [--dest .claude/skills] [--source URL_OR_PATH]

Dry run by default. The skills come from a public MIT-licensed repo, pinned in
factory/skills/helper-skills.json to one commit; the script fetches exactly that
commit, refuses if the fetched commit differs, copies each listed skill folder
into --dest, and writes a notice with the licence. Existing skills are left alone
unless --force. Nothing is fetched without --apply. Run it yourself (it needs
network access to GitHub); agents never run it.

The agents work without these skills (their prompts carry the essentials), but
use them when present. /factory doctor reports which are missing.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(HERE, "..", "skills", "helper-skills.json")


def git(*args, cwd=None):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dest", default=".claude/skills")
    ap.add_argument("--source", help="override the repo URL or a local path (for tests)")
    ap.add_argument("--config", default=CONFIG, help="alternative helper-skills.json (for tests)")
    args = ap.parse_args()
    cfg = json.load(open(args.config, encoding="utf-8"))
    source = args.source or cfg["source"]
    todo = []
    for name, sub in cfg["skills"].items():
        target = os.path.join(args.dest, name)
        if os.path.exists(target) and not args.force:
            print(f"keep    {name} (already installed; --force to replace)")
        else:
            todo.append((name, sub, target))
            print(f"install {name}  <- {sub}")
    if not args.apply:
        print(f"\ndry run: would fetch {source} at {cfg['ref'][:10]} and write {len(todo)} skill(s) to {args.dest}. Add --apply.")
        return
    if not todo:
        print("nothing to do")
        return
    tmp = tempfile.mkdtemp(prefix="factory-skills-")
    try:
        git("init", "-q", tmp)
        got = git("fetch", "--depth", "1", source, cfg["ref"], cwd=tmp)
        if got.returncode != 0:
            sys.exit(f"error: could not fetch {cfg['ref'][:10]} from {source}: {got.stderr.strip()[:200]}")
        git("checkout", "-q", "FETCH_HEAD", cwd=tmp)
        head = git("rev-parse", "HEAD", cwd=tmp).stdout.strip()
        if head != cfg["ref"]:
            sys.exit(f"error: fetched {head[:10]} but the pin is {cfg['ref'][:10]}; refusing to install")
        os.makedirs(args.dest, exist_ok=True)
        for name, sub, target in todo:
            src = os.path.join(tmp, sub)
            if not os.path.isfile(os.path.join(src, "SKILL.md")):
                sys.exit(f"error: {sub} has no SKILL.md at the pinned commit")
            if os.path.exists(target):
                shutil.rmtree(target)
            shutil.copytree(src, target, ignore=shutil.ignore_patterns(".git"))
        lic = os.path.join(tmp, "LICENSE")
        notice = os.path.join(args.dest, "HELPER-SKILLS-NOTICE.md")
        with open(notice, "w", encoding="utf-8") as fh:
            fh.write(f"# Helper skills\n\nInstalled from {source} at {cfg['ref']}.\n"
                     f"Licence: {cfg['license']}\n\n")
            if os.path.isfile(lic):
                fh.write("```\n" + open(lic, encoding="utf-8").read() + "\n```\n")
        print(f"installed {len(todo)} skill(s) to {args.dest} from {head[:10]}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
