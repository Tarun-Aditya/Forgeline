#!/usr/bin/env python3
"""Find review findings that keep coming back, so a repeated mistake becomes a check.

  lessons.py [--factory factory] [--min-jobs 2] [--threshold 0.4] [--write]

Reads every `VERDICT: CHANGES` review in factory/jobs/*/round-*/ and in the committed
copies under factory/audit/*/round-*/, groups findings that say nearly the same thing,
and reports each group seen in at least --min-jobs different jobs. For each group it
suggests where to fix it, strongest first: architecture, types, a lint, a test, and only
then a written rule. No model is used; grouping is word overlap, so read the groups and
merge or discard them yourself. A person decides what to build. --write saves the report
to factory/lessons.md.
"""

import argparse
import glob
import os
import re

STOP = set("this that with from have been will would should could when then than into only also does "
           "must needs need not the and for are its the can use used using add added line file files "
           "code change changes make made but they their there which what where while after before".split())
PATHISH = re.compile(r"`[^`]*`|\b[\w./-]+\.\w{1,5}(?::\d+)?\b|\b\d+\b")

# (keywords, level, what to build). First match wins; checked against the group's text.
HINTS = [
    (("suppression", "noqa", "ts-ignore", "eslint-disable", "type: ignore", "skip", "weakened"),
     "check", "policy_check.py already scans for this (weakened bar); confirm it flagged the diff and extend it if not"),
    (("validat", "reject", "boundary", "negative", "bad input", "invalid"),
     "types", "a boundary test, or a type that cannot hold the bad value; reuse the existing validator"),
    (("import", "unused", "naming", "format", "whitespace", "dead code", "console", "debug", "print"),
     "lint", "a lint rule or banned API whose error names the fix"),
    (("null", "undefined", "none", "optional", "type", "cast", "any "),
     "types", "a stricter type so the bad state cannot be written"),
    (("test", "assert", "coverage", "regression", "untested"),
     "test", "a test of the behavior, or a coverage ratchet in merge_policy.constraints"),
    (("secret", "token", "password", "injection", "sanitiz", "escape", "auth"),
     "check", "a scan in policy_check.py or a hook that refuses the pattern"),
    (("config", "migration", "schema", "dependency", "manifest", "lockfile"),
     "architecture", "one owner for this concern, or move it behind an escalate path"),
]


def tokens(text):
    clean = PATHISH.sub(" ", text.lower())
    return {w for w in re.findall(r"[a-z]{4,}", clean) if w not in STOP}


def findings_in(path):
    """Numbered items under '## Findings' of a CHANGES review."""
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    if not text.startswith("VERDICT: CHANGES"):
        return []
    block = re.search(r"^## Findings\s*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    if not block:
        return []
    items = re.split(r"^\s*\d+\.\s+", block.group(1), flags=re.M)[1:]
    return [" ".join(i.split()) for i in items if i.strip()]


def collect(factory):
    seen, out = set(), []
    pattern = [os.path.join(factory, "jobs", "*", "round-*", "review-*.md"),
               os.path.join(factory, "audit", "*", "round-*", "review-*.md")]
    for pat in pattern:
        for path in sorted(glob.glob(pat)):
            parts = path.split(os.sep)
            job, rnd, name = parts[-3], parts[-2], parts[-1][len("review-"):-len(".md")]
            for text in findings_in(path):
                key = (job, rnd, name, text)
                if key in seen:
                    continue
                seen.add(key)
                out.append({"job": job, "round": rnd, "reviewer": name, "text": text, "tokens": tokens(text)})
    return out


def jaccard(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def group(items, threshold):
    groups = []
    for item in items:
        best, score = None, 0.0
        for g in groups:
            s = max(jaccard(item["tokens"], m["tokens"]) for m in g)
            if s > score:
                best, score = g, s
        if best is not None and score >= threshold:
            best.append(item)
        else:
            groups.append([item])
    return groups


def suggest(members):
    blob = " ".join(m["text"].lower() for m in members)
    for words, level, what in HINTS:
        if any(w in blob for w in words):
            return level, what
    return "rule", "a written rule in AGENTS.md or REVIEW.md, only if nothing above can enforce it"


def report(factory, min_jobs, threshold):
    items = collect(factory)
    groups = [g for g in group(items, threshold) if len({m["job"] for m in g}) >= min_jobs]
    groups.sort(key=lambda g: (-len({m["job"] for m in g}), -len(g)))
    lines = ["# Lessons from repeated review findings", "",
             f"{len(items)} finding(s) read from CHANGES reviews; {len(groups)} group(s) seen in at least {min_jobs} jobs.", ""]
    if not groups:
        lines.append("Nothing repeats yet.")
    for n, g in enumerate(groups, 1):
        level, what = suggest(g)
        jobs = sorted({m["job"] for m in g})
        lines += [f"## {n}. {g[0]['text'][:90]}", "",
                  f"- Seen {len(g)} time(s) in {len(jobs)} jobs: {', '.join(jobs)}",
                  f"- Raised by: {', '.join(sorted({m['reviewer'] for m in g}))}",
                  f"- Suggested level: **{level}**: {what}",
                  "- Examples:"]
        lines += [f"  - {m['job']} {m['round']} {m['reviewer']}: {m['text'][:200]}" for m in g[:3]]
        lines.append("")
    lines += ["## Rule table", "", "Keep one row per rule, with what enforces it. A rule that nothing enforces and that",
              "broke again is a repeat: fix it at the strongest level in the same change.", "",
              "| Rule | Enforced by | Last broken |", "| --- | --- | --- |", "| | | |"]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--factory", default="factory")
    parser.add_argument("--min-jobs", type=int, default=2)
    parser.add_argument("--threshold", type=float, default=0.4)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    text = report(args.factory, args.min_jobs, args.threshold)
    if args.write:
        with open(os.path.join(args.factory, "lessons.md"), "w", encoding="utf-8") as fh:
            fh.write(text)
    print(text)


if __name__ == "__main__":
    main()
