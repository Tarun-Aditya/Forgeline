#!/usr/bin/env python3
"""Schedule the recurring parts of the factory with cron.

  schedule.py [--repo .] [--install | --uninstall] [--claude PATH]

Prints the crontab block by default (a dry run). With --install it replaces the
block between the factory markers in your crontab and leaves every other line alone;
--uninstall removes it. Safe to run repeatedly.

  every hour    collect.py then run.py --diagnose --open-intents
  Monday 06:00  scan.py run --lens all
  Sunday 05:00  evals: run_evals.py, then agent_evals.py

Output goes to factory/maintain/cron.log. ANTHROPIC_API_KEY is removed from the
job's environment so the Claude CLI uses your subscription login, not API billing.
Nothing scheduled here merges, deploys or pushes; intents and findings wait for you.
"""

import argparse
import os
import shlex
import subprocess
import sys

BEGIN = "# BEGIN software-factory (managed by schedule.py)"
END = "# END software-factory"


def block(repo, claude):
    q = shlex.quote
    base = f"cd {q(repo)} && env -u ANTHROPIC_API_KEY PATH={q(os.path.dirname(claude) + ':/usr/local/bin:/usr/bin:/bin')}"
    log = f">> {q(os.path.join(repo, 'factory/maintain/cron.log'))} 2>&1"
    cl = f"--claude {q(claude)}"
    lines = [
        BEGIN,
        f"0 * * * * {base} sh -c 'python3 -I factory/maintain/collect.py; python3 -I factory/maintain/run.py --diagnose --open-intents {cl}' {log}",
        f"0 6 * * 1 {base} python3 -I factory/maintain/scan.py run --lens all {cl} {log}",
        f"0 5 * * 0 {base} sh -c 'python3 -I factory/evals/run_evals.py; python3 -I factory/evals/agent_evals.py {cl}' {log}",
        END,
    ]
    return "\n".join(lines) + "\n"


def current():
    try:
        out = subprocess.run(["crontab", "-l"], capture_output=True, text=True, check=False)
    except FileNotFoundError:
        sys.exit("error: crontab is not installed here; use --crontab-file or run this on your own machine")
    return out.stdout if out.returncode == 0 else ""


def strip(text):
    if BEGIN not in text:
        return text
    head, rest = text.split(BEGIN, 1)
    tail = rest.split(END, 1)[1] if END in rest else ""
    return (head.rstrip("\n") + "\n" + tail.lstrip("\n")).lstrip("\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--repo", default=".")
    ap.add_argument("--claude")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--crontab-file", help="edit this file instead of the real crontab (for tests)")
    args = ap.parse_args()
    repo = os.path.abspath(args.repo)
    claude = args.claude or subprocess.run(["which", "claude"], capture_output=True, text=True).stdout.strip()
    if not claude:
        sys.exit("error: claude not found on PATH; pass --claude")
    if not (args.install or args.uninstall):
        print(block(repo, claude), end="")
        print("# dry run: add --install to write this to your crontab")
        return
    if args.crontab_file:
        existing = open(args.crontab_file).read() if os.path.isfile(args.crontab_file) else ""
    else:
        existing = current()
    base = strip(existing)
    if args.uninstall:
        new = base
    elif args.install:
        new = (base.rstrip("\n") + "\n\n" if base.strip() else "") + block(repo, claude)
    if args.crontab_file:
        open(args.crontab_file, "w").write(new)
    else:
        done = subprocess.run(["crontab", "-"], input=new, text=True, capture_output=True, check=False)
        if done.returncode != 0:
            sys.exit(f"error: crontab failed: {done.stderr.strip()}")
    print("uninstalled" if args.uninstall else "installed")


if __name__ == "__main__":
    main()
