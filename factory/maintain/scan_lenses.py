"""Deterministic scan lenses: no model, repeatable, cheap. Each returns a list of raw
findings in the same shape the scanner agents write (see scanner-security.md), which
scan.py then validates and tracks like any other.

  secrets       credential patterns in tracked files and in git history
  dependencies  unpinned or unlocked dependencies in manifests
"""

import fnmatch
import importlib.util
import json
import os
import re
import subprocess

MAX_FILE = 400_000


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, errors="ignore", check=False)


def load_patterns(repo):
    """Reuse the commit hook's patterns so the scan and the gate never disagree."""
    here = os.path.dirname(os.path.abspath(__file__))
    for path in (os.path.join(repo, ".claude", "hooks", "factory_hooks.py"),
                 os.path.join(here, "..", "..", ".claude", "hooks", "factory_hooks.py")):
        if os.path.isfile(path):
            spec = importlib.util.spec_from_file_location("factory_hooks_patterns", path)
            mod = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)
            except SystemExit:
                continue
            return mod.SECRET_PATTERNS, mod.SECRET_FILES
    raise RuntimeError("factory_hooks.py not found; cannot load secret patterns")


def is_binary(data):
    return b"\0" in data[:2048]


def lens_secrets(repo):
    patterns, secret_files = load_patterns(repo)
    findings, n = [], 0
    files = git(repo, "ls-files").stdout.splitlines()
    skip = ("factory/evals/", "factory/maintain/scans/", "factory/maintain/breaches/", "factory/reviews/")
    for rel in files:
        if rel.startswith(skip):
            continue
        base = os.path.basename(rel)
        if any(fnmatch.fnmatch(rel, p) or fnmatch.fnmatch(base, p) for p in secret_files):
            n += 1
            findings.append({"id": f"K-{n:03d}", "class": "secret-file", "title": f"Secret-style file is tracked: {rel}",
                             "severity": "high", "confidence": "medium", "file": rel, "line": 1, "evidence": base,
                             "why": "Key and environment files in git are readable by everyone with the repository, forever.",
                             "fix": "Remove it from the index, add it to .gitignore, rotate whatever it holds."})
            continue
        path = os.path.join(repo, rel)
        try:
            if os.path.getsize(path) > MAX_FILE:
                continue
            data = open(path, "rb").read()
        except OSError:
            continue
        if is_binary(data):
            continue
        for i, line in enumerate(data.decode("utf-8", "ignore").splitlines(), 1):
            for kind, rx in patterns:
                m = rx.search(line)
                if m:
                    n += 1
                    findings.append({"id": f"K-{n:03d}", "class": "hardcoded-secret", "title": f"{kind} in {rel}",
                                     "severity": "high", "confidence": "high", "file": rel, "line": i,
                                     "evidence": m.group(0)[:4] + "...",
                                     "why": f"A {kind} is committed. Anyone with the repository can use it until it is rotated.",
                                     "fix": "Rotate it, load it from the environment or a secret manager, and purge it from history."})
                    break
    # History: secrets that were added once and later removed are still leaked.
    log = git(repo, "log", "-p", "--no-color", "--format=commit %H", "--all", "--max-count=3000")
    sha, seen, current = None, set(), None
    for line in log.stdout.splitlines():
        if line.startswith("commit "):
            sha = line.split()[1]
        elif line.startswith("+++ b/"):
            current = line[6:]
        elif line.startswith("+") and not line.startswith("+++") and sha:
            for kind, rx in patterns:
                m = rx.search(line)
                if m and current and not current.startswith(skip) and (sha, current, kind) not in seen:
                    seen.add((sha, current, kind))
                    # Present in the working tree already? Then the first pass found it.
                    if any(f["file"] == current and f["evidence"] == m.group(0)[:4] + "..." for f in findings):
                        break
                    n += 1
                    findings.append({"id": f"K-{n:03d}", "class": "secret-in-history",
                                     "title": f"{kind} in history: {current} at {sha[:8]}",
                                     "severity": "high", "confidence": "medium", "file": current or "?", "line": 1,
                                     "evidence": m.group(0)[:4] + "...", "history": True,
                                     "why": f"A {kind} was committed in {sha[:8]} and later removed. It stays readable in history.",
                                     "fix": "Rotate it. Purging history is optional once it is rotated."})
                    break
    return findings


def lens_dependencies(repo):
    findings, n = [], 0
    tracked = set(git(repo, "ls-files").stdout.splitlines())

    def add(title, rel, line, evidence, why, fix, sev="medium"):
        nonlocal n
        n += 1
        findings.append({"id": f"D-{n:03d}", "class": "risky-dependency", "title": title, "severity": sev,
                         "confidence": "high", "file": rel, "line": line, "evidence": evidence, "why": why, "fix": fix})

    for rel in sorted(tracked):
        base = os.path.basename(rel)
        folder = os.path.dirname(rel)
        sibling = lambda name: os.path.join(folder, name) in tracked  # noqa: E731
        path = os.path.join(repo, rel)
        try:
            text = open(path, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        lines = text.splitlines()
        if base == "package.json":
            if not (sibling("package-lock.json") or sibling("pnpm-lock.yaml") or sibling("yarn.lock")):
                add(f"No lockfile next to {rel}", rel, 1, lines[0] if lines else "{",
                    "Without a lockfile every install can pull different versions.", "Commit the lockfile your package manager creates.")
            try:
                data = json.loads(text)
            except ValueError:
                continue
            for section in ("dependencies", "devDependencies"):
                for pkg, ver in (data.get(section) or {}).items():
                    idx = next((i for i, l in enumerate(lines, 1) if f'"{pkg}"' in l), 1)
                    ev = lines[idx - 1].strip() if lines else ""
                    if ver in ("*", "latest", "") or re.match(r"^(git|github|http|https|file):|^[\w.-]+/[\w.-]+(#.*)?$", ver):
                        add(f"{pkg} is not pinned to a version ({ver or 'empty'})", rel, idx, ev,
                            "An unpinned or URL dependency can change under you or be hijacked.", "Pin a released version range.", "high")
        elif re.match(r"requirements.*\.txt$", base):
            for i, l in enumerate(lines, 1):
                s = l.strip()
                if not s or s.startswith(("#", "-r", "-c", "--")):
                    continue
                if re.match(r"^(git\+|https?:)", s) or ("==" not in s and "~=" not in s and ">=" not in s and "<" not in s):
                    add(f"Unpinned requirement: {s}", rel, i, s, "An unpinned or URL requirement can change under you.",
                        "Pin with == (or use a lock file such as pip-tools output).", "high" if s.startswith(("git+", "http")) else "medium")
                elif ">=" in s and "<" not in s and "==" not in s:
                    add(f"Open-ended requirement: {s}", rel, i, s, "A lower bound alone accepts any future major release.",
                        "Add an upper bound or pin with ==.", "low")
        elif base == "pyproject.toml":
            if not (sibling("poetry.lock") or sibling("uv.lock") or sibling("pdm.lock") or sibling("Pipfile.lock")) \
                    and re.search(r"^\[(project|tool\.poetry)\]", text, re.M) and re.search(r"dependencies", text):
                add(f"No lockfile next to {rel}", rel, 1, lines[0] if lines else "[project]",
                    "Without a lockfile installs are not reproducible.", "Commit the lock file your tool creates.", "low")
        elif base == "go.mod" and not sibling("go.sum"):
            add(f"go.sum missing next to {rel}", rel, 1, lines[0] if lines else "module", "Module checksums are not verified without go.sum.",
                "Commit go.sum.", "medium")
    return findings


LENSES = {"secrets": lens_secrets, "dependencies": lens_dependencies}
