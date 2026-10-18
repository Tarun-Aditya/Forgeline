#!/usr/bin/env python3
"""Find the packages in a repo, and which ones a change touches. Standard library only.

  monorepo.py detect [--repo .] [--policy factory/policy.json] [--snippet]
  monorepo.py scope  [--repo .] [--base BRANCH] [--branch HEAD] [--policy factory/policy.json]

`detect` lists the packages: npm/yarn/pnpm workspaces, lerna, go.work, Cargo workspaces, uv workspaces, Maven modules,
Gradle includes, or (with none of those) folders that each hold their own manifest, plus
whatever policy.json `packages` declares (declared entries win). A repo with no workspace
config has no packages and the factory treats it as one unit, as before.
`--snippet` prints a `packages` block to paste into policy.json, with the verify command each
package would need left for you to confirm.

`scope` lists the files a branch changed, the packages that own them, and the packages
that depend on those (a change to a library is a change to everything that uses it).

policy.json:
  "packages": [{"name": "api", "path": "services/api", "verify_commands": ["pytest -q"],
                "depends_on": ["shared"]}]
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from factory_lib import base_branch  # noqa: E402

SKIP_DIRS = {"node_modules", ".git", "dist", "build", "target", "vendor", ".venv", "venv", "__pycache__"}
DOC_ONLY = re.compile(r"(^|/)[^/]*\.(md|txt|rst)$|^docs/|^factory/(jobs|audit|activity)/")


def _read(path):
    try:
        with open(path, encoding="utf-8", errors="ignore") as fh:
            return fh.read()
    except OSError:
        return ""


def _json(path):
    try:
        return json.loads(_read(path) or "null")
    except ValueError:
        return None


_DIRS = {}


def _tracked_dirs(repo):
    """Every folder that holds a tracked file, or None outside git. Cached per repo."""
    if repo not in _DIRS:
        r = subprocess.run(["git", "-C", repo, "ls-files"], capture_output=True, text=True, check=False)
        if r.returncode != 0:
            _DIRS[repo] = None
        else:
            dirs = set()
            for f in r.stdout.splitlines():
                parts = f.split("/")[:-1]
                dirs.update("/".join(parts[:i]) for i in range(1, len(parts) + 1))
            _DIRS[repo] = dirs
    return _DIRS[repo]


def _expand(repo, patterns):
    """Folders matching workspace globs; `!pattern` excludes. Relative posix paths.
    Uses tracked files when in git, so node_modules and build output never match."""
    from factory_lib import glob_to_regex
    tracked = _tracked_dirs(repo)
    found, skipped = [], []
    for pat in patterns:
        neg = pat.startswith("!")
        pat = pat.lstrip("!").strip().removeprefix("./").rstrip("/")
        if not pat:
            continue
        if tracked is not None:
            rx = glob_to_regex(pat)
            hits = [d for d in tracked if rx.match(d)]
        else:
            hits = [os.path.relpath(h, repo).replace(os.sep, "/") for h in glob.glob(os.path.join(repo, pat), recursive=True)
                    if os.path.isdir(h)]
        for rel in hits:
            if SKIP_DIRS & set(rel.split("/")) or not os.path.isdir(os.path.join(repo, rel)):
                continue
            (skipped if neg else found).append(rel)
    return sorted(set(found) - set(skipped))


def _workspace_globs(repo):
    """(kind, [dirs]) pairs from each workspace config at the repo root."""
    out = []
    pj = _json(os.path.join(repo, "package.json")) or {}
    ws = pj.get("workspaces")
    if isinstance(ws, dict):
        ws = ws.get("packages")
    if isinstance(ws, list):
        out.append(("node", _expand(repo, ws)))
    pnpm = _read(os.path.join(repo, "pnpm-workspace.yaml"))
    if pnpm:
        pats = re.findall(r"^\s*-\s*['\"]?([^'\"#\s]+)", pnpm.split("packages:", 1)[-1], re.M)
        out.append(("node", _expand(repo, pats)))
    lerna = _json(os.path.join(repo, "lerna.json")) or {}
    if isinstance(lerna.get("packages"), list):
        out.append(("node", _expand(repo, lerna["packages"])))
    gowork = _read(os.path.join(repo, "go.work"))
    if gowork:
        dirs = re.findall(r"^\s*use\s+(\S+)\s*$", gowork, re.M)
        for block in re.findall(r"use\s*\((.*?)\)", gowork, re.S):
            dirs += [l.strip().split()[0] for l in block.splitlines() if l.strip() and not l.strip().startswith("//")]
        out.append(("go", _expand(repo, dirs)))
    cargo = _read(os.path.join(repo, "Cargo.toml"))
    m = re.search(r"\[workspace\].*?members\s*=\s*\[(.*?)\]", cargo, re.S)
    if m:
        out.append(("rust", _expand(repo, re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)))))
    pyproj = _read(os.path.join(repo, "pyproject.toml"))
    m = re.search(r"\[tool\.uv\.workspace\].*?members\s*=\s*\[(.*?)\]", pyproj, re.S)
    if m:
        out.append(("python", _expand(repo, re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)))))
    pom = _read(os.path.join(repo, "pom.xml"))
    if "<modules>" in pom:
        out.append(("maven", _expand(repo, re.findall(r"<module>\s*([^<\s]+)\s*</module>", pom))))
    for name in ("settings.gradle", "settings.gradle.kts"):
        gradle = _read(os.path.join(repo, name))
        if gradle:
            mods = [m.strip(":").replace(":", "/") for inc in re.findall(r"include\s*\(?([^\n)]*)", gradle)
                    for m in re.findall(r"['\"]([^'\"]+)['\"]", inc)]
            out.append(("gradle", _expand(repo, mods)))
    if not any(dirs for _, dirs in out):
        out = [("inferred", _inferred(repo))]
    return out


MANIFESTS = ("package.json", "pyproject.toml", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts")


def _inferred(repo):
    """No workspace config: folders (up to 3 deep) with their own manifest, if there are at least two."""
    tracked = _tracked_dirs(repo)
    if tracked is None:
        return []
    dirs = [d for d in sorted(tracked) if d.count("/") < 3 and not SKIP_DIRS & set(d.split("/"))
            and any(os.path.isfile(os.path.join(repo, d, m)) for m in MANIFESTS)]
    # a folder inside another manifest folder is the same package
    top = [d for d in dirs if not any(d.startswith(o + "/") for o in dirs if o != d)]
    return top if len(top) >= 2 else []


def _describe(repo, rel, kind):
    base = os.path.join(repo, rel)
    name, deps = rel, []
    if kind == "node":
        pj = _json(os.path.join(base, "package.json")) or {}
        name = pj.get("name") or rel
        deps = [k for sec in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")
                for k in (pj.get(sec) or {})]
    elif kind == "go":
        mod = _read(os.path.join(base, "go.mod"))
        m = re.search(r"^module\s+(\S+)", mod, re.M)
        name = m.group(1) if m else rel
        deps = re.findall(r"^\s*(?:require\s+)?([\w./~-]+)\s+v[\w.+-]+", mod, re.M)
    elif kind == "rust":
        cargo = _read(os.path.join(base, "Cargo.toml"))
        m = re.search(r"\[package\].*?name\s*=\s*['\"]([^'\"]+)['\"]", cargo, re.S)
        name = m.group(1) if m else rel
        deps = re.findall(r"^([\w-]+)\s*=\s*\{[^}]*path\s*=", cargo, re.M)
    elif kind in ("python", "inferred", "maven", "gradle"):
        pyproj = _read(os.path.join(base, "pyproject.toml"))
        m = re.search(r"^name\s*=\s*['\"]([^'\"]+)['\"]", pyproj, re.M)
        if m:
            name = m.group(1)
            deps = [re.split(r"[<>=!~\[ ;]", d, 1)[0] for d in
                    re.findall(r"['\"]([A-Za-z0-9_.-]+[^'\"]*)['\"]", (re.search(r"dependencies\s*=\s*\[(.*?)\]", pyproj, re.S) or [None, ""])[1])]
        else:
            pj = _json(os.path.join(base, "package.json")) or {}
            name = pj.get("name") or name
            deps = list((pj.get("dependencies") or {})) + list((pj.get("devDependencies") or {}))
            gomod = re.search(r"^module\s+(\S+)", _read(os.path.join(base, "go.mod")), re.M)
            if not pj and gomod:
                name = gomod.group(1)
            pom = re.search(r"<artifactId>([^<]+)</artifactId>", re.sub(r"<parent>.*?</parent>", "", _read(os.path.join(base, "pom.xml")), flags=re.S))
            if pom:
                name = pom.group(1)
    return {"name": name, "path": rel, "kind": kind, "depends_on": deps, "verify_commands": []}


def detect(repo, policy=None):
    """Packages as a list of {name, path, kind, depends_on, verify_commands}."""
    pkgs = {}
    for kind, dirs in _workspace_globs(repo):
        for rel in dirs:
            pkgs.setdefault(rel, _describe(repo, rel, kind))
    for entry in (policy or {}).get("packages") or []:
        path = (entry.get("path") or "").strip("/").removeprefix("./")
        if not path:
            continue
        base = pkgs.get(path) or {"name": entry.get("name") or path, "path": path, "kind": "declared",
                                  "depends_on": [], "verify_commands": []}
        base.update({k: v for k, v in entry.items() if k in ("name", "verify_commands", "depends_on") and v is not None})
        pkgs[path] = base
    names = {p["name"] for p in pkgs.values()}
    for p in pkgs.values():
        p["depends_on"] = sorted(set(d for d in p["depends_on"] if d in names and d != p["name"]))
    return sorted(pkgs.values(), key=lambda p: p["path"])


def owner(path, pkgs):
    """The package whose folder holds `path` (the deepest one), or None."""
    path = path.replace("\\", "/").removeprefix("./")
    best = None
    for p in pkgs:
        if path == p["path"] or path.startswith(p["path"] + "/"):
            if best is None or len(p["path"]) > len(best["path"]):
                best = p
    return best


def dependents(names, pkgs):
    """`names` plus every package that depends on them, directly or through others."""
    out = set(names)
    grew = True
    while grew:
        grew = False
        for p in pkgs:
            if p["name"] not in out and out & set(p["depends_on"]):
                out.add(p["name"])
                grew = True
    return out


def scope(changed, pkgs, extra_names=()):
    """What a set of changed files touches.

    direct: packages that own a changed file. affected: direct plus dependents plus extra_names.
    root_change: a file outside every package (and not a doc) changed, so everything is affected.
    """
    direct, root = set(), []
    for f in changed:
        if f.startswith("factory/audit/"):
            continue
        p = owner(f, pkgs)
        if p:
            direct.add(p["name"])
        elif not DOC_ONLY.search(f):
            root.append(f)
    affected = dependents(direct | set(extra_names), pkgs)
    if root and pkgs:
        affected = {p["name"] for p in pkgs}
    return {"direct": sorted(direct), "affected": sorted(affected), "root_change": root}


def changed_files(repo, base, branch):
    r = subprocess.run(["git", "-C", repo, "diff", "--name-only", f"{base}...{branch}"],
                       capture_output=True, text=True, check=False)
    return [l for l in r.stdout.splitlines() if l] if r.returncode == 0 else []


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("cmd", choices=["detect", "scope"])
    ap.add_argument("--repo", default=".")
    ap.add_argument("--base", default=None)
    ap.add_argument("--branch", default="HEAD")
    ap.add_argument("--policy", default=None)
    ap.add_argument("--snippet", action="store_true")
    args = ap.parse_args()
    repo = os.path.abspath(args.repo)
    pol_path = args.policy or os.path.join(repo, "factory", "policy.json")
    policy = _json(pol_path) or {}
    args.base = args.base or base_branch(repo, policy)
    pkgs = detect(repo, policy)
    if args.cmd == "detect":
        if args.snippet:
            print(json.dumps({"packages": [{"name": p["name"], "path": p["path"],
                                            "verify_commands": p["verify_commands"] or ["<the test command for " + p["path"] + ">"],
                                            "depends_on": p["depends_on"]} for p in pkgs]}, indent=2))
        else:
            print(json.dumps(pkgs, indent=2))
        return
    files = changed_files(repo, args.base, args.branch)
    print(json.dumps(dict(scope(files, pkgs), changed=files, packages=len(pkgs)), indent=2))


if __name__ == "__main__":
    main()
