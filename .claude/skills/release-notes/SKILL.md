---
name: release-notes
description: Write release notes from merged factory jobs and git history between two refs. Use when preparing a release or a changelog entry.
---

# Release notes

1. **Range.** Ask for, or find, the two refs: `git describe --tags --abbrev=0` for
   the last release, and `main`.
2. **Collect.** `git log --first-parent --format='%h %s' <last>..main`. For each
   merge, read `factory/audit/<job-id>/spec.md` when it exists: the title, the
   Requirements and the Risk line are the source of truth, not the commit text.
3. **Group** under: Added, Changed, Fixed, Security, Breaking. A change that
   edited a migration, a public API or a config key is Breaking until proven
   otherwise.
4. **Write for the reader of the product**, not the repo: what they can now do or
   what changed for them, in one line each. Keep ticket keys in brackets.
5. **Flag** anything escalated, any job with a waived intent, and any migration, so
   the person releasing knows what needs attention.
6. Do not invent changes. If a commit has no spec and an unclear message, list it
   under "Unclassified" for a human.
