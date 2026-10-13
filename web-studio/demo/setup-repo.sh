#!/usr/bin/env bash
# Makes a throwaway repo (a tiny Python library) with the factory installed, for the demo.
# Usage: setup-repo.sh <dir>
set -euo pipefail
R="${1:?usage: setup-repo.sh <dir>}"
FACTORY_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
rm -rf "$R"; mkdir -p "$R/tests"; cd "$R"
git init -q -b main
git config user.email demo@example.com; git config user.name demo
cat > textkit.py <<'PY'
"""Tiny text helpers."""


def title_case(text: str) -> str:
    """Capitalise the first letter of each word."""
    return " ".join(w[:1].upper() + w[1:].lower() for w in text.split())
PY
cat > tests/test_textkit.py <<'PY'
import unittest
from textkit import title_case


class TitleCase(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(title_case("hello world"), "Hello World")


if __name__ == "__main__":
    unittest.main()
PY
cat > AGENTS.md <<'MD'
# textkit

Tiny Python library. Python 3.12, standard library only.

- Test: `python3 -m unittest discover -s tests`
- Layout: `textkit.py` (code), `tests/test_*.py` (tests).
- Do not touch: `factory/`, `.claude/`.
MD
cp -r "$FACTORY_ROOT/.claude" "$FACTORY_ROOT/factory" .
rm -rf factory/jobs factory/activity factory/dashboard.html; mkdir -p factory/jobs; : > factory/backlog.md
cat "$FACTORY_ROOT/.gitignore.factory" >> .gitignore; printf '__pycache__/\n' >> .gitignore
python3 - <<'PY'
import json
d = json.load(open("factory/policy.json"))
d.setdefault("merge_policy", {})["verify_commands"] = ["python3 -m unittest discover -s tests"]
d["test_globs"] = ["tests/**"]
json.dump(d, open("factory/policy.json", "w"), indent=2)
PY
git add -A >/dev/null && git commit -q -m "textkit with the factory installed"
echo "demo repo ready: $R"
