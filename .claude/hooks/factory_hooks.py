#!/usr/bin/env python3
"""Claude Code PreToolUse hooks for the software factory. Standard library only.

  factory_hooks.py files   Edit/Write/MultiEdit/NotebookEdit: frozen paths and test lock
  factory_hooks.py bash    Bash: blocked commands (push, deploy) and secrets in commits

Claude Code passes the tool call as JSON on stdin. Exit 2 blocks the call and
shows stderr to the agent; exit 0 allows it.

Where the rules come from, first match wins:
  1. $FACTORY_POLICY_FILE
  2. policy.json one folder above this script (the managed install puts it there,
     where only an administrator can write)
  3. factory/policy.json in the project directory
So a managed install overrides whatever the project's own policy says.

Scope: the path rules apply only inside factory worktrees (a checkout whose
parent folder is named <repo>-factory), so a person editing the main checkout is
never blocked. The command and secrets rules apply everywhere in the session.
"""

import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
# factory_lib.py sits next to this script in a managed install, or in the project.
sys.path.insert(0, os.path.join(PROJECT, "factory", "scripts"))
sys.path.insert(0, HERE)


def policy_path():
    candidates = [
        os.environ.get("FACTORY_POLICY_FILE"),
        os.path.join(HERE, "..", "policy.json"),
        os.path.join(PROJECT, "factory", "policy.json"),
    ]
    return next((c for c in candidates if c and os.path.isfile(c)), candidates[-1])


try:
    from factory_lib import any_match, load_policy
    POLICY = load_policy(policy_path())
except (ImportError, OSError, ValueError) as err:
    # Hooks installed without the factory folder: don't lock the session.
    print(f"factory hooks inactive: {err}", file=sys.stderr)
    sys.exit(0)

LOCK_FILE = ".factory-test-lock"

SECRET_PATTERNS = [
    ("AWS access key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----")),
    ("GitHub token", re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}")),
    ("Slack token", re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("API key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}")),
    (
        "hard-coded credential",
        re.compile(r"(?i)(api[_-]?key|secret|passwd|password|token)\s*[:=]\s*['\"][^'\"\s]{12,}['\"]"),
    ),
]
SECRET_FILES = [".env*", "**/*.pem", "**/*.key", "**/id_rsa", "**/id_ed25519"]
MAX_UNTRACKED_BYTES = 200_000


def block(message):
    print(f"Blocked by factory policy: {message}", file=sys.stderr)
    sys.exit(2)


def git(directory, *args):
    return subprocess.run(
        ["git", "-C", directory, *args], capture_output=True, text=True, check=False
    )


def existing_ancestor(path):
    path = os.path.dirname(path) if not os.path.isdir(path) else path
    while path and not os.path.isdir(path):
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
    return path


def toplevel(path):
    out = git(existing_ancestor(path), "rev-parse", "--show-toplevel")
    return os.path.realpath(out.stdout.strip()) if out.returncode == 0 else None


def is_factory_worktree(top):
    return os.path.basename(os.path.dirname(top)).endswith("-factory")


def check_files(payload):
    tool_input = payload.get("tool_input") or {}
    target = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not target:
        return
    cwd = payload.get("cwd") or os.getcwd()
    target = target if os.path.isabs(target) else os.path.join(cwd, target)
    target = os.path.join(os.path.realpath(os.path.dirname(target)), os.path.basename(target))
    top = toplevel(target)
    if not top or not is_factory_worktree(top):
        return
    rel = os.path.relpath(target, top).replace(os.sep, "/")

    pattern = any_match(POLICY["frozen_paths"], rel)
    if pattern:
        block(
            f"{rel} matches frozen path '{pattern}'. Agents may not edit it. If the plan "
            "truly needs it, write STATUS: BLOCKED in build.md naming the file; a human decides."
        )
    if os.path.exists(os.path.join(top, LOCK_FILE)):
        pattern = any_match(POLICY["test_globs"], rel)
        if pattern:
            block(
                f"{rel} is a test file and the bug-fix test lock is on. Fix the code, not the "
                "test. If the test itself is wrong, write STATUS: BLOCKED in build.md and explain."
            )


def added_lines(diff_text):
    for line in diff_text.splitlines():
        if line.startswith("+") and not line.startswith("+++"):
            yield line[1:]


def find_secret(lines):
    for line in lines:
        for kind, rx in SECRET_PATTERNS:
            match = rx.search(line)
            if match:
                return kind, match.group(0)[:4] + "..."
    return None


def commit_dir(command, cwd):
    match = re.search(r"\bcd\s+(?:\"([^\"]+)\"|'([^']+)'|(\S+))", command)
    if not match:
        return cwd
    target = next(g for g in match.groups() if g)
    target = os.path.expanduser(target)
    return target if os.path.isabs(target) else os.path.join(cwd, target)


def check_secrets(command, cwd):
    if not re.search(r"\bgit\s+commit\b", command):
        return
    directory = commit_dir(command, cwd)
    if not os.path.isdir(directory) or git(directory, "rev-parse", "--git-dir").returncode != 0:
        return

    names = git(directory, "diff", "--cached", "--name-only").stdout.splitlines()
    scans = [("staged", list(added_lines(git(directory, "diff", "--cached", "-U0").stdout)))]
    # The same command may stage more before it commits (`git add . && git commit`, `-a`).
    if re.search(r"\bgit\s+add\b", command) or re.search(r"\bgit\s+commit\b[^&;|]*\s-[A-Za-z]*a", command):
        names += git(directory, "diff", "--name-only").stdout.splitlines()
        names += git(directory, "ls-files", "--others", "--exclude-standard").stdout.splitlines()
        scans.append(("unstaged", list(added_lines(git(directory, "diff", "-U0").stdout))))
        for name in git(directory, "ls-files", "--others", "--exclude-standard").stdout.splitlines():
            full = os.path.join(directory, name)
            try:
                if os.path.getsize(full) <= MAX_UNTRACKED_BYTES:
                    with open(full, encoding="utf-8", errors="ignore") as fh:
                        scans.append((name, fh.read().splitlines()))
            except OSError:
                continue

    for name in names:
        if any_match(SECRET_FILES, name):
            block(f"{name} looks like a credentials file and must not be committed.")
    for label, lines in scans:
        found = find_secret(lines)
        if found:
            kind, hint = found
            block(
                f"possible {kind} ({hint}) in {label} changes. Remove it and read it from an "
                "environment variable or secret manager instead."
            )


def check_commands(command):
    env_name = POLICY.get("authorization_env", "FACTORY_RELEASE_AUTHORIZED")
    # Only the hook's own environment counts. A prefix like `VAR=1 git push` sets it for
    # the pushed process, not for this hook, so an agent cannot authorize itself.
    if os.environ.get(env_name) == "1":
        return
    for pattern in POLICY["blocked_commands"]:
        if re.search(pattern, command):
            block(
                f"'{pattern}' needs release authorization. Agents may prepare the change but "
                f"cannot pass the production gate; a person authorizes by starting Claude Code "
                f"with {env_name}=1. Never push, deploy or publish from a factory job."
            )


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    if mode == "files":
        check_files(payload)
    elif mode == "bash":
        command = (payload.get("tool_input") or {}).get("command") or ""
        check_commands(command)
        check_secrets(command, payload.get("cwd") or os.getcwd())


if __name__ == "__main__":
    main()
