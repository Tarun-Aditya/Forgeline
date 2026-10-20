#!/usr/bin/env python3
"""Check a job branch's changed files against factory/policy.json.

  policy_check.py <repo-or-worktree> <branch> [--base BRANCH]

Prints one line per finding and always exits 0, so the approver can read the
output. A clean branch prints CLEAN.

  VIOLATION frozen path edited: <file>     an agent changed a frozen path
  ESCALATE-TRIGGER escalate path: <file>   a human must approve the merge
  ESCALATE-TRIGGER dependency manifest: <file>
  ESCALATE-TRIGGER large change: N changed lines, cap is C   (policy.merge_policy.auto_max_lines)
  ESCALATE-TRIGGER cross-package change: a, b, c   more packages than merge_policy.max_auto_packages
  ESCALATE-TRIGGER no tests cover <package or repo>: <file>   source changed where no test file exists
  ESCALATE-TRIGGER weakened bar: <what>: <file>   a suppression, skipped test, deleted test
                                                  or stripped assertion; a human must see it
"""

import argparse
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from factory_lib import any_match, base_branch, changed_line_count, load_policy  # noqa: E402
import monorepo  # noqa: E402


# Added lines that quietly lower the quality bar. Each can be legitimate, so a hit
# escalates to a human instead of failing the branch.
SUPPRESSIONS = re.compile(
    r"@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable|#\s*noqa|#\s*type:\s*ignore|#\s*pragma:\s*no cover"
    r"|#\s*pylint:\s*disable|//\s*nolint|#\[allow\(|@SuppressWarnings"
)
SKIPS = re.compile(
    r"\b(?:it|test|describe)\.(?:skip|todo)\b|\bx(?:it|describe|test)\(|@pytest\.mark\.(?:skip|xfail)"
    r"|\bpytest\.(?:skip|xfail)\(|@unittest\.skip|\bt\.Skip(?:Now)?\(|#\[ignore\]|\.only\("
)
ASSERTS = re.compile(r"\bassert\b|\bexpect\(|\bt\.(?:Error|Fatal|Fail)|\bassert[A-Z_]\w*\(|\bshould\b")


def weakened_bar(repo, base, branch, policy):
    """Findings for suppressions, skipped tests, deleted tests and stripped assertions."""
    status = subprocess.run(["git", "-C", repo, "diff", "--name-status", f"{base}...{branch}"],
                            capture_output=True, text=True, check=False)
    patch = subprocess.run(["git", "-C", repo, "diff", "-U0", f"{base}...{branch}"],
                           capture_output=True, text=True, check=False)
    if status.returncode != 0 or patch.returncode != 0:
        return []
    tests = policy.get("test_globs", [])
    out = []
    for line in status.stdout.splitlines():
        code, _, path = line.partition("\t")
        if code == "D" and any_match(tests, path):
            out.append(f"ESCALATE-TRIGGER weakened bar: test file deleted: {path}")
    path = None
    stripped = {}
    added = {}
    for line in patch.stdout.splitlines():
        if line.startswith("+++ "):
            path = line[4:].removeprefix("b/") if line[4:] != "/dev/null" else None
        elif line.startswith("--- "):
            continue
        elif path is None or path.startswith("factory/audit/"):
            continue
        elif line.startswith("+"):
            body = line[1:]
            is_test = bool(any_match(tests, path))
            if SUPPRESSIONS.search(body):
                out.append(f"ESCALATE-TRIGGER weakened bar: suppression added: {path}: {body.strip()[:80]}")
            if is_test and SKIPS.search(body):
                out.append(f"ESCALATE-TRIGGER weakened bar: test skipped or focused: {path}: {body.strip()[:80]}")
            if is_test and ASSERTS.search(body):
                added[path] = added.get(path, 0) + 1
        elif line.startswith("-") and any_match(tests, path) and ASSERTS.search(line[1:]):
            stripped[path] = stripped.get(path, 0) + 1
    for path, n in sorted(stripped.items()):
        if n > added.get(path, 0):
            out.append(f"ESCALATE-TRIGGER weakened bar: {n - added.get(path, 0)} fewer assertions: {path}")
    return out


SOURCE_EXT = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rs", ".java", ".kt", ".rb",
              ".php", ".cs", ".swift", ".c", ".cc", ".cpp", ".scala"}


def package_findings(repo, base, branch, changed, policy):
    """Cross-package changes and source changed in a place with no tests at all."""
    out = []
    mp = policy.get("merge_policy") or {}
    pkgs = monorepo.detect(repo, policy)
    cap = mp.get("max_auto_packages", 3)
    if pkgs and cap:
        direct = monorepo.scope(changed, pkgs)["direct"]
        if len(direct) > cap:
            out.append(f"ESCALATE-TRIGGER cross-package change: {', '.join(direct)} ({len(direct)} packages, cap is {cap})")
    tracked = subprocess.run(["git", "-C", repo, "ls-tree", "-r", "--name-only", branch],
                             capture_output=True, text=True, check=False).stdout.splitlines()
    tests = policy.get("test_globs", [])
    test_files = [f for f in tracked if any_match(tests, f)]
    warned = set()
    for path in changed:
        if os.path.splitext(path)[1] not in SOURCE_EXT or any_match(tests, path) or path.startswith("factory/"):
            continue
        pkg = monorepo.owner(path, pkgs)
        prefix = pkg["path"] + "/" if pkg else ""
        label = pkg["name"] if pkg else "the repo"
        if label in warned:
            continue
        if not any(f.startswith(prefix) for f in test_files):
            warned.add(label)
            out.append(f"ESCALATE-TRIGGER no tests cover {label}: {path} changed and no test file exists there")
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("repo")
    parser.add_argument("branch")
    parser.add_argument("--base", default=None)
    parser.add_argument(
        "--policy",
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "policy.json"),
    )
    args = parser.parse_args()

    policy = load_policy(args.policy)
    args.base = args.base or base_branch(args.repo, policy)
    diff = subprocess.run(
        ["git", "-C", args.repo, "diff", "--name-only", f"{args.base}...{args.branch}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if diff.returncode != 0:
        print(f"ERROR could not diff {args.base}...{args.branch}: {diff.stderr.strip()}")
        return

    findings = []
    for path in filter(None, diff.stdout.splitlines()):
        # The audit record is written by the orchestrator, not by an agent.
        if path.startswith("factory/audit/"):
            continue
        if any_match(policy["frozen_paths"], path):
            findings.append(f"VIOLATION frozen path edited: {path}")
        if any_match(policy["escalate_paths"], path):
            findings.append(f"ESCALATE-TRIGGER escalate path: {path}")
        if any_match(policy["dependency_files"], path):
            findings.append(f"ESCALATE-TRIGGER dependency manifest: {path}")

    mp = policy.get("merge_policy") or {}
    cap = mp.get("auto_max_lines", 0)
    if cap:
        try:
            lines = changed_line_count(args.repo, args.base, args.branch, mp.get("size_exclude", []))
            if lines > cap:
                findings.append(f"ESCALATE-TRIGGER large change: {lines} changed lines, cap is {cap}")
        except RuntimeError as err:
            findings.append(f"ERROR could not count lines: {err}")

    findings += package_findings(args.repo, args.base, args.branch, [p for p in diff.stdout.splitlines() if p], policy)
    findings += weakened_bar(args.repo, args.base, args.branch, policy)
    print("\n".join(findings) if findings else "CLEAN")


if __name__ == "__main__":
    main()
