#!/usr/bin/env python3
"""Review any branch or pull request with the pr-reviewer agent.

  review_branch.py [--base main] [--head HEAD | --pr NUMBER] [--claude claude]
                   [--title T] [--body-file F] [--name N]

Writes factory/reviews/<name>/review.json (validated), review.md, and, when the
head is a pull request, gh-review.sh holding the exact `gh` command to post it.
This script never posts anything: posting is an outside write, so a person runs
gh-review.sh after reading review.md.

With --pr, the head is fetched with `git fetch origin pull/N/head`, so it needs a
remote named origin. Without one, pass --head with a local branch.

Every comment is checked mechanically: the file must be in the diff, the line must be
one the diff adds or changes, and the evidence must appear on that line. Comments that
fail are dropped and listed, so an invented comment cannot reach a pull request.
"""

import argparse
import json
import os
import re
import subprocess
import sys

TOOLS = "Read,Grep,Glob,Bash(git diff *),Bash(git log *),Bash(git show *),Bash(git ls-files *),Write(factory/reviews/**),Edit(factory/reviews/**)"
HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=False)


def changed_lines(repo, base, head):
    """{file: {new_line_number: text}} for lines added or changed between base...head."""
    out = git(repo, "diff", "-U0", "--no-color", f"{base}...{head}")
    if out.returncode != 0:
        sys.exit(f"error: git diff failed: {out.stderr.strip()}")
    files, current, line_no = {}, None, 0
    for raw in out.stdout.splitlines():
        if raw.startswith("+++ "):
            current = raw[6:] if raw.startswith("+++ b/") else None
            if current:
                files.setdefault(current, {})
        elif m := HUNK.match(raw):
            line_no = int(m.group(1))
        elif current and raw.startswith("+") and not raw.startswith("+++"):
            files[current][line_no] = raw[1:]
            line_no += 1
    return files


def collapse(t):
    return re.sub(r"\s+", " ", t).strip()


def validate(review, diff):
    if not isinstance(review, dict) or review.get("verdict") not in ("PASS", "CHANGES") or not isinstance(review.get("comments"), list):
        return None, [("review.json", "needs verdict PASS|CHANGES and a comments list")]
    good, bad = [], []
    for c in review["comments"]:
        if not isinstance(c, dict) or any(k not in c for k in ("file", "line", "severity", "comment", "evidence", "lens")):
            bad.append((c, "missing fields"))
            continue
        if c["severity"] not in ("important", "nit"):
            bad.append((c, "unknown severity"))
            continue
        lines = diff.get(c["file"])
        if lines is None or c["line"] not in lines:
            bad.append((c, "line is not added or changed by this diff"))
            continue
        ev = collapse(c["evidence"])
        if len(ev) < 4 or ev not in collapse(lines[c["line"]]):
            bad.append((c, "evidence is not on that line"))
            continue
        good.append(c)
    review = dict(review, comments=good)
    # A CHANGES verdict must rest on a surviving important comment.
    if review["verdict"] == "CHANGES" and not any(c["severity"] == "important" for c in good):
        review["verdict"] = "PASS"
        review["downgraded"] = "no important comment survived validation"
    return review, bad


def render(review, bad, name):
    lines = [f"# Review {name}: {review['verdict']}", "", review.get("summary", ""), ""]
    if review.get("downgraded"):
        lines += [f"_Verdict lowered to PASS: {review['downgraded']}._", ""]
    for c in sorted(review["comments"], key=lambda c: (c["severity"] != "important", c["file"], c["line"])):
        lines += [f"- **{c['severity']}** `{c['file']}:{c['line']}` ({c['lens']}): {c['comment']}"]
    if not review["comments"]:
        lines.append("No comments.")
    if bad:
        lines += ["", "## Dropped by validation", ""]
        lines += [f"- {(b[0] or {}).get('file', '?') if isinstance(b[0], dict) else '?'}: {b[1]}" for b in bad]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--base", default="main")
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--pr", type=int)
    ap.add_argument("--claude", default="claude")
    ap.add_argument("--title", default="")
    ap.add_argument("--body-file")
    ap.add_argument("--name")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--timeout", type=int, default=1800)
    args = ap.parse_args()
    repo = os.path.abspath(args.repo)

    head = args.head
    if args.pr:
        ref = f"refs/factory-review/pr-{args.pr}"
        fetched = git(repo, "fetch", "origin", f"pull/{args.pr}/head:{ref}")
        if fetched.returncode != 0:
            sys.exit(f"error: could not fetch PR {args.pr}: {fetched.stderr.strip()[:200]}")
        head = ref
    name = args.name or (f"pr-{args.pr}" if args.pr else re.sub(r"[^A-Za-z0-9._-]+", "-", head).strip("-"))
    folder = os.path.join(repo, "factory", "reviews", name)
    os.makedirs(folder, exist_ok=True)
    review_path = os.path.join(folder, "review.json")
    if os.path.exists(review_path):
        os.remove(review_path)
    diff = changed_lines(repo, args.base, head)
    if not diff:
        sys.exit("error: the diff is empty; nothing to review")

    body = open(args.body_file, encoding="utf-8").read() if args.body_file else ""
    prompt = (f"Review the change. Base: {args.base}. Head: {head}. Review folder: factory/reviews/{name}/. "
              f"Title: {args.title or '(none)'}. Description: {body[:3000] or '(none)'}")
    cmd = [args.claude, "-p", prompt, "--agent", "pr-reviewer", "--permission-mode", "dontAsk", "--allowedTools", TOOLS,
           "--output-format", "json", "--no-session-persistence"]
    try:
        res = subprocess.run(cmd, cwd=repo, capture_output=True, text=True, timeout=args.timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as err:
        sys.exit(f"error: reviewer did not run: {err}")
    if not os.path.isfile(review_path):
        sys.exit(f"error: the reviewer wrote no review.json. {(res.stdout or res.stderr)[-300:]}")
    try:
        raw = json.load(open(review_path, encoding="utf-8"))
    except ValueError as err:
        sys.exit(f"error: review.json is not valid JSON: {err}")
    review, bad = validate(raw, diff)
    if review is None:
        sys.exit(f"error: {bad[0][1]}")
    json.dump(review, open(os.path.join(folder, "review.validated.json"), "w"), indent=2)
    open(os.path.join(folder, "review.md"), "w", encoding="utf-8").write(render(review, bad, name))
    if args.pr:
        flag = "--request-changes" if review["verdict"] == "CHANGES" else "--comment"
        with open(os.path.join(folder, "gh-review.sh"), "w", encoding="utf-8") as fh:
            fh.write(f"#!/bin/sh\n# Read review.md first. This posts to the pull request.\n"
                     f"gh pr review {args.pr} {flag} --body-file \"$(dirname \"$0\")/review.md\"\n")
    print(f"review {name}: {review['verdict']}, {len(review['comments'])} comment(s), {len(bad)} dropped")
    print(f"read: {os.path.join(folder, 'review.md')}")


if __name__ == "__main__":
    main()
