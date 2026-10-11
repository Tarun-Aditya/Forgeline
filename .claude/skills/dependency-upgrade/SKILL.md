---
name: dependency-upgrade
description: Upgrade one dependency safely. Use when asked to bump a package, fix a vulnerable dependency, or when a scan flags a risky manifest entry. One package per change.
---

# Dependency upgrade

Dependencies are an escalate path in this factory: a human approves the merge. Make
that review easy.

1. **Scope.** One package per change. If asked for many, make a backlog item each.
2. **Read before bumping.** Find the current and target versions in the manifest
   and lockfile. Read the package's changelog or release notes for every version in
   between (WebFetch or the repo's `node_modules`/site-packages). List breaking
   changes that touch APIs this repo uses (Grep for each).
3. **Bump with the project's tool** (`npm install pkg@x`, `pip-compile`, `poetry
   update pkg`), never by hand-editing a lockfile. Commit manifest and lockfile
   together.
4. **Prove it.** Run the full test, build and lint commands from AGENTS.md. If a
   breaking change applies, change the calling code in the same commit and say which.
5. **Write the record** in `build.md`: from-version, to-version, why (CVE id or
   feature), breaking changes found and how handled, test results, how to roll back
   (revert the commit and reinstall).
6. **Never** add a dependency to fix a dependency, widen a version range to "make
   it work", or pin to a pre-release without saying so in `build.md`.
