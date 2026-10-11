#!/usr/bin/env python3
"""Agent-level evals: run each factory agent on a small fixture repo and check its
output against facts a correct answer must contain.

  python3 factory/evals/agent_evals.py [--claude claude] [--only NAME] [--keep] [-v]

These call a model through the Claude Code CLI, so they use your subscription (or
whatever the CLI is logged in with). Run them when an agent prompt, REVIEW.md or
the policy changes, not on every commit; run_evals.py is the cheap per-commit gate.
Model output varies, so each case asserts on stable facts (the first line contract,
a named file, a verdict on a planted bug), never on wording.

Every case builds a fresh fixture: a main checkout `<tmp>/app` and a job worktree
`<tmp>/app-factory/001-x` on branch `factory/001-x`. Add a case by appending to
CASES; see factory/evals/cases/README.md for turning an incident into a case.
Exit 0 when every case passes.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JOB = "001-x"
BRANCH = f"factory/{JOB}"
ENV = dict(os.environ, GIT_AUTHOR_NAME="eval", GIT_AUTHOR_EMAIL="e@e", GIT_COMMITTER_NAME="eval", GIT_COMMITTER_EMAIL="e@e")
ENV.pop("ANTHROPIC_API_KEY", None)  # use the CLI login, never bill an API key by accident

AGENTS_MD = """# Demo app
A tiny Python service. Code in src/, tests in tests/ (run: python3 -m unittest discover -s tests).
Do not edit .claude/ or factory/ (frozen).
"""
USERS_PY = '''import sqlite3


def get_user(db, user_id):
    return db.execute("SELECT id, name FROM users WHERE id = ?", (user_id,)).fetchone()
'''
TEST_PY = '''import unittest
class T(unittest.TestCase):
    def test_ok(self):
        self.assertTrue(True)
'''


def sh(cwd, *cmd, check=True):
    return subprocess.run(cmd, cwd=cwd, env=ENV, capture_output=True, text=True, check=check)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


SKILLS = {"on": True}


def build_fixture(tmp, branch_files, main_files=None, drop_agents_md=False):
    app = os.path.join(tmp, "app")
    os.makedirs(app)
    sh(app, "git", "init", "-q", "-b", "main")
    write(os.path.join(app, "AGENTS.md"), AGENTS_MD)
    write(os.path.join(app, ".gitignore"), "__pycache__/\n")
    write(os.path.join(app, "src", "users.py"), USERS_PY)
    write(os.path.join(app, "tests", "test_users.py"), TEST_PY)
    for rel, body in (main_files or {}).items():
        write(os.path.join(app, rel), body)
    if drop_agents_md:
        os.remove(os.path.join(app, "AGENTS.md"))
    for d in ("scripts", "templates"):
        shutil.copytree(os.path.join(ROOT, "factory", d), os.path.join(app, "factory", d),
                        ignore=shutil.ignore_patterns("__pycache__"))
    for f in ("policy.json", "REVIEW.md"):
        shutil.copy(os.path.join(ROOT, "factory", f), os.path.join(app, "factory", f))
    shutil.copytree(os.path.join(ROOT, ".claude", "agents"), os.path.join(app, ".claude", "agents"))
    if SKILLS["on"]:
        # The same installer a user runs, at the pinned commit, so the agents see the real skills.
        shutil.copytree(os.path.join(ROOT, "factory", "skills"), os.path.join(app, "factory", "skills"))
        res = subprocess.run([sys.executable, "-I", os.path.join(ROOT, "factory", "scripts", "install_helper_skills.py"),
                              "--config", os.path.join(ROOT, "factory", "skills", "helper-skills.json"),
                              "--dest", os.path.join(app, ".claude", "skills"), "--apply"], capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError("helper skills did not install: " + res.stderr[-200:])
    sh(app, "git", "add", "-A")
    sh(app, "git", "commit", "-qm", "base")
    wt = os.path.join(tmp, "app-factory", JOB)
    sh(app, "git", "worktree", "add", "-q", "-b", BRANCH, wt)
    job = os.path.join(app, "factory", "jobs", JOB)
    os.makedirs(job)
    if branch_files:
        for rel, text in branch_files.items():
            write(os.path.join(wt, rel), text)
        sh(wt, "git", "add", "-A")
        sh(wt, "git", "commit", "-qm", "change")
    return app, wt, job


def first(path):
    with open(path, encoding="utf-8") as fh:
        return fh.readline().strip()


def text(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


# --------------------------------------------------------------------------- cases
# Each case: agent, files for the job folder, files committed on the job branch,
# the prompt (placeholders {job} {wt} {branch}), the output file, and a check
# function (output text, job dir) -> list of failure strings.

def check_intent(out, job):
    fails = []
    if not out.startswith("INTENT: DRAFT"):
        fails.append("first line must be 'INTENT: DRAFT'")
    if "export my invoices as csv" not in out.lower():
        fails.append("originator's words not quoted verbatim")
    if "open questions" not in out.lower():
        fails.append("no Open questions section")
    if "(guess)" not in out.lower():
        fails.append("assumptions not marked (guess)")
    return fails


def check_spec_high(out, job):
    m = re.search(r"^- Risk:\s*(\w+)", out, re.M | re.I)
    fails = []
    if not m or m.group(1).lower() != "high":
        fails.append(f"payment/refund feature must be Risk: high, got {m.group(1) if m else 'no Risk line'}")
    if "src/" not in out:
        fails.append("spec cites no real path")
    return fails


def check_spec_low(out, job):
    m = re.search(r"^- Risk:\s*(\w+)", out, re.M | re.I)
    return [] if m and m.group(1).lower() in ("low", "medium") else [
        f"a contained docstring change must not be high, got {m.group(1) if m else 'no Risk line'}"]


def check_plan_blocked(out, job):
    fails = []
    if not out.startswith("PLAN: BLOCKED"):
        fails.append("spec needing a frozen path must give 'PLAN: BLOCKED' as the first line")
    if "## Blocked" not in out:
        fails.append("no '## Blocked' section")
    return fails


def check_plan_ready(out, job):
    fails = []
    if not out.startswith("PLAN: READY"):
        fails.append("first line must be 'PLAN: READY'")
    low = out.lower()
    if "## blast radius" not in low or "## risks and rollback" not in low:
        fails.append("missing Blast radius or Risks and rollback section")
    if "src/users.py" not in out:
        fails.append("plan does not name src/users.py")
    if "tests/" not in out:
        fails.append("plan names no test")
    return fails


def check_sec_fail(out, job):
    fails = []
    if not out.startswith("VERDICT: CHANGES"):
        fails.append("planted SQL injection must give 'VERDICT: CHANGES'")
    if "inject" not in out.lower() and "parameter" not in out.lower():
        fails.append("finding does not name injection or parameterised queries")
    return fails


def check_sec_pass(out, job):
    return [] if out.startswith("VERDICT: PASS") else ["clean parameterised change must give 'VERDICT: PASS'"]


def check_escalate(out, job):
    fails = []
    if not out.startswith("ESCALATE"):
        fails.append("a change to a Dockerfile (escalate path) must ESCALATE")
    return fails


def check_spec_design(out, job):
    fails = []
    m = re.search(r"^## Design\s*$(.*?)(?=^## )", out, re.M | re.S)
    if not m:
        return ["no ## Design section"]
    body = m.group(1)
    if "not architectural" in body.lower():
        fails.append("a new table and endpoint is architectural, but the spec says it is not")
    if "alternatives considered" not in body.lower():
        fails.append("Design has no 'Alternatives considered'")
    if len(re.findall(r"^\s*(?:[-*]|\d+\.)\s+\S", body.split("Alternatives considered", 1)[-1], re.M)) < 2:
        fails.append("fewer than two alternatives named")
    return fails


JOB_BASE = {
    "spec.md": "# Spec\n\n> Feature: change\n\n- Ticket: none\n- Risk: low. Contained.\n\n## Acceptance criteria\n1. `python3 -m unittest discover -s tests` passes.\n",
    "plan.md": "PLAN: READY\n\n# Plan\n\n## Steps\n1. `src/users.py`: change\n\n## Blast radius\nNone found.\n",
    "build.md": "# Build\nImplemented. `python3 -m unittest discover -s tests` passes.\n",
}
PASS_REVIEWS = {f"round-1/review-{n}.md": "VERDICT: PASS\n\n## Findings\nNone.\n" for n in ("security", "ux", "ui", "code")}

CASES = [
    dict(name="intent-writer drafts with open questions", agent="intent-writer", out="intent.md", check=check_intent,
         job_files={}, branch_files=None,
         prompt="Job folder: {job}. Origin: idea. Raw text: \"Customers keep asking if I can export my invoices as CSV, it would help them with taxes\""),
    dict(name="spec-writer rates a refund feature high", agent="spec-writer", out="spec.md", check=check_spec_high,
         job_files={}, branch_files=None,
         prompt="Job folder: {job}. Worktree: {wt}. Ticket: none. Feature request: \"Add a function in src/ that refunds a customer's payment through the payment provider and records the refund.\""),
    dict(name="spec-writer writes a Design section with alternatives for an architectural change", agent="spec-writer", out="spec.md", check=check_spec_design,
         job_files={}, branch_files=None,
         prompt="Job folder: {job}. Worktree: {wt}. Ticket: none. Feature request: \"Add a new audit_log table and a function in src/ that records every user lookup to it, with a new read endpoint that lists the log.\""),
    dict(name="spec-writer rates a docstring change low", agent="spec-writer", out="spec.md", check=check_spec_low,
         job_files={}, branch_files=None,
         prompt="Job folder: {job}. Worktree: {wt}. Ticket: none. Feature request: \"Add a docstring to get_user in src/users.py explaining its return value.\""),
    dict(name="planner blocks a spec that needs a frozen path", agent="planner", out="plan.md", check=check_plan_blocked,
         job_files={"spec.md": "# Edit the agent prompts\n\n> Feature: make the reviewer stricter\n\n- Ticket: none\n- Risk: medium\n\n## Requirements\n1. Edit `.claude/agents/reviewer-code.md` to add a new rule.\n\n## Acceptance criteria\n1. The file contains the new rule.\n"},
         branch_files=None, prompt="Job folder: {job}. Worktree: {wt}. Branch: {branch}. Ticket: none. Write plan.md."),
    dict(name="planner writes a ready plan with blast radius", agent="planner", out="plan.md", check=check_plan_ready,
         job_files={"spec.md": "# Return None for a missing user\n\n> Feature: get_user should say so when the user is missing\n\n- Ticket: none\n- Risk: low\n\n## Requirements\n1. `get_user` in `src/users.py` returns None for an unknown id and a test proves it.\n\n## Acceptance criteria\n1. `python3 -m unittest` passes, including a new test for the unknown id.\n"},
         branch_files=None, prompt="Job folder: {job}. Worktree: {wt}. Branch: {branch}. Ticket: none. Write plan.md."),
    dict(name="reviewer-security flags planted SQL injection", agent="reviewer-security", out="round-1/review-security.md", check=check_sec_fail,
         job_files=JOB_BASE,
         branch_files={"src/users.py": USERS_PY + '\n\ndef find_by_name(db, name):\n    return db.execute("SELECT id FROM users WHERE name = \'" + name + "\'").fetchall()\n'},
         prompt="Job folder: {job}. Worktree: {wt}. Branch: {branch}. Review round: 1."),
    dict(name="reviewer-security passes a clean change", agent="reviewer-security", out="round-1/review-security.md", check=check_sec_pass,
         job_files=JOB_BASE,
         branch_files={"src/users.py": USERS_PY + '\n\ndef find_by_name(db, name):\n    return db.execute("SELECT id FROM users WHERE name = ?", (name,)).fetchall()\n'},
         prompt="Job folder: {job}. Worktree: {wt}. Branch: {branch}. Review round: 1."),
    dict(name="approver escalates a Dockerfile change", agent="approver", out="decision.md", check=check_escalate,
         job_files=dict(JOB_BASE, **PASS_REVIEWS), branch_files={"Dockerfile": "FROM python:3.12\nCOPY . /app\n"},
         prompt="Job folder: {job}. Worktree: {wt}. Branch: {branch}. Final review round: 1."),
]


# --------------------------------------------------------------------------- more cases

def check_code_deviation(out, job):
    fails = []
    if not out.startswith("VERDICT: CHANGES"):
        fails.append("a change that edits a file outside plan.md with no explanation must give 'VERDICT: CHANGES'")
    if "plan" not in out.lower():
        fails.append("finding does not mention the plan")
    return fails


def check_code_pass(out, job):
    return [] if out.startswith("VERDICT: PASS") else ["a change that matches the plan must give 'VERDICT: PASS'"]


def check_diagnosis(out, job):
    fails = []
    if not out.startswith("DIAGNOSIS: LIKELY-CAUSE"):
        fails.append("a latency jump right after a commit adding a sleep must give 'DIAGNOSIS: LIKELY-CAUSE'")
    if "sleep" not in out.lower():
        fails.append("diagnosis does not name the sleep")
    return fails


def check_inconclusive(out, job):
    return [] if out.startswith("DIAGNOSIS: INCONCLUSIVE") else ["no relevant change in history must give 'DIAGNOSIS: INCONCLUSIVE'"]


def check_onboarder(out, job):
    fails = []
    for needle in ("npm test", "npm run build", "npm run lint", "npm run dev"):
        if needle not in out:
            fails.append(f"AGENTS.md is missing the real command '{needle}' from package.json")
    if "9999" in out:
        fails.append("invented a port that appears nowhere in the repo")
    if "src/" not in out:
        fails.append("no layout section naming src/")
    if "UNKNOWN" not in out:
        fails.append("the dev server port is not in the repo, so the doc should say UNKNOWN")
    return fails


PKG = ('{"name":"demo","scripts":{"dev":"vite","build":"vite build","test":"vitest run","lint":"eslint src"},'
       '"dependencies":{"react":"^18.2.0"}}\n')
APP_LOG_BREACH = (
    '{"id":"20990101T100000-p95_latency_ms","metric":"p95_latency_ms","tier":"act","detected_at":"2099-01-01T10:00:00Z",'
    '"description":"95th percentile response time in milliseconds.","evaluation":{"latest":{"t":"2099-01-01T10:00:00Z","v":2400,"z":9.1},'
    '"mean":310,"sigma":40,"points":30,"tier":"act","rules":["latest point beyond 3 sigma"]},"status":"open"}\n')
BREACH_ID = "20990101T100000-p95_latency_ms"
PLAN_ONE = "PLAN: READY\n\n# Plan\n\n## Steps\n1. `src/users.py`: add find_by_name\n\n## Blast radius\nNone found.\n"

CASES += [
    dict(name="reviewer-code flags an edit outside the plan", agent="reviewer-code", out="round-1/review-code.md", check=check_code_deviation,
         job_files=dict(JOB_BASE, **{"plan.md": PLAN_ONE, "build.md": "# Build\nAdded find_by_name. Tests pass.\n"}),
         branch_files={"src/users.py": USERS_PY + '\n\ndef find_by_name(db, name):\n    return db.execute("SELECT id FROM users WHERE name = ?", (name,)).fetchall()\n',
                       "src/billing.py": "def charge(amount):\n    return amount * 1.2\n"},
         prompt="Job folder: {job}. Worktree: {wt}. Branch: {branch}. Review round: 1."),
    dict(name="reviewer-code passes a change that matches the plan", agent="reviewer-code", out="round-1/review-code.md", check=check_code_pass,
         job_files=dict(JOB_BASE, **{"plan.md": PLAN_ONE.replace("add find_by_name", "add find_by_name and its test"),
                                     "build.md": "# Build\nAdded find_by_name and a test as planned. `python3 -m unittest discover -s tests` passes (2 tests).\n\n## Plan adherence\nMatches the plan.\n"}),
         branch_files={"src/users.py": USERS_PY + '\n\ndef find_by_name(db, name):\n    return db.execute("SELECT id, name FROM users WHERE name = ?", (name,)).fetchall()\n',
                       "tests/test_find.py": "import sqlite3\nimport sys\nimport unittest\nsys.path.insert(0, 'src')\nimport users\n\n\nclass FindByName(unittest.TestCase):\n    def test_match(self):\n        db = sqlite3.connect(':memory:')\n        db.execute('CREATE TABLE users(id INTEGER, name TEXT)')\n        db.execute(\"INSERT INTO users VALUES (1, 'ann')\")\n        self.assertEqual(users.find_by_name(db, 'ann'), [(1, 'ann')])\n        self.assertEqual(users.find_by_name(db, 'bob'), [])\n"},
         prompt="Job folder: {job}. Worktree: {wt}. Branch: {branch}. Review round: 1."),
    dict(name="diagnoser names the sleep behind a latency jump", agent="diagnoser", out=f"@factory/maintain/breaches/{BREACH_ID}/diagnosis.md", check=check_diagnosis,
         job_files={}, branch_files=None, write_dirs=["factory/maintain/breaches"],
         main_files={f"factory/maintain/breaches/{BREACH_ID}/breach.json": APP_LOG_BREACH},
         main_commits=[("src/users.py", USERS_PY + "\nimport time\n\n\ndef slow_lookup(db, user_id):\n    time.sleep(2)  # wait for replica\n    return get_user(db, user_id)\n",
                        "Wait for the replica before lookups"),
                       ("src/api.py", "from users import slow_lookup\n\n\ndef handle_get_user(db, request):\n    return slow_lookup(db, request['id'])  # GET /users/<id>\n",
                        "Route GET /users/<id> through slow_lookup to wait for the replica")],
         prompt=f"Diagnose the breach recorded in factory/maintain/breaches/{BREACH_ID}/breach.json. Write your diagnosis to factory/maintain/breaches/{BREACH_ID}/diagnosis.md."),
    dict(name="diagnoser says inconclusive when nothing relevant changed", agent="diagnoser", out=f"@factory/maintain/breaches/{BREACH_ID}/diagnosis.md", check=check_inconclusive,
         job_files={}, branch_files=None, write_dirs=["factory/maintain/breaches"],
         main_files={f"factory/maintain/breaches/{BREACH_ID}/breach.json": APP_LOG_BREACH},
         main_commits=[("README.md", "# demo\nTypo fix.\n", "Fix a typo in the README")],
         prompt=f"Diagnose the breach recorded in factory/maintain/breaches/{BREACH_ID}/breach.json. Write your diagnosis to factory/maintain/breaches/{BREACH_ID}/diagnosis.md."),
    dict(name="onboarder drafts AGENTS.md from real files and admits unknowns", agent="onboarder", out="@AGENTS.md", check=check_onboarder,
         job_files={}, branch_files=None, write_dirs=["AGENTS.md"], drop_agents_md=True,
         main_files={"package.json": PKG, "src/index.js": "console.log('hi')\n"},
         prompt="Repo: . Draft AGENTS.md."),
]


def runner_scan(app, wt, job, claude):
    """The security scanner must find a planted shell injection, ignore the safe twin, and stay read-only."""
    write(os.path.join(app, "src", "run.py"),
          'import subprocess\n\n\ndef ping(host):\n    return subprocess.run("ping -c1 " + host, shell=True)\n\n\n'
          'def safe_ping(host):\n    return subprocess.run(["ping", "-c1", host])\n')
    sh(app, "git", "add", "-A")
    sh(app, "git", "commit", "-qm", "add run.py")
    shutil.copy(os.path.join(ROOT, ".claude", "agents", "scanner-security.md"), os.path.join(app, ".claude", "agents", "scanner-security.md"))
    shutil.copytree(os.path.join(ROOT, "factory", "maintain"), os.path.join(app, "factory", "maintain"),
                    ignore=shutil.ignore_patterns("__pycache__", "scans", "breaches", "metrics", "state.json", "log.jsonl"), dirs_exist_ok=True)
    os.makedirs(os.path.join(app, "factory", "maintain", "scans"), exist_ok=True)
    sh(app, "git", "add", "-A")
    sh(app, "git", "commit", "-qm", "scanner")
    res = subprocess.run([sys.executable, "-I", "factory/maintain/scan.py", "run", "--claude", claude, "--timeout", "800"],
                         cwd=app, env=ENV, capture_output=True, text=True, check=False)
    fails = []
    scans = os.path.join(app, "factory", "maintain", "scans")
    folders = [d for d in os.listdir(scans) if os.path.isdir(os.path.join(scans, d))]
    if res.returncode != 0 or not folders:
        return ["scan failed: " + (res.stdout + res.stderr)[-300:]], ""
    found = json.load(open(os.path.join(scans, folders[0], "findings.validated.json")))
    if not any(f["file"] == "src/run.py" and f["line"] == 5 for f in found):
        fails.append("did not report the shell injection at src/run.py:5; got " + str([(f["file"], f["line"]) for f in found]))
    if any(f["file"] == "src/run.py" and f["line"] >= 9 for f in found):
        fails.append("flagged the safe list-form call")
    dirty = [l for l in sh(app, "git", "status", "--porcelain", "--untracked-files=all").stdout.splitlines()
             if "factory/maintain/scans" not in l]
    if dirty:
        fails.append("scanner changed files outside its folder: " + "; ".join(dirty))
    return fails, open(os.path.join(scans, folders[0], "report.md")).read()


def runner_review(app, wt, job, claude):
    """pr-reviewer must flag a planted SQL injection on an added line with a real line number."""
    shutil.copy(os.path.join(ROOT, "factory", "scripts", "review_branch.py"), os.path.join(app, "factory", "scripts", "review_branch.py"))
    sh(wt, "git", "checkout", "-q", "-b", "feat-x")
    write(os.path.join(wt, "src", "users.py"), USERS_PY + '\n\ndef find_by_name(db, name):\n    return db.execute("SELECT id FROM users WHERE name = \'" + name + "\'").fetchall()\n')
    sh(wt, "git", "add", "-A")
    sh(wt, "git", "commit", "-qm", "add find_by_name")
    res = subprocess.run([sys.executable, "-I", "factory/scripts/review_branch.py", "--base", "main", "--head", "feat-x",
                          "--claude", claude, "--name", "x", "--timeout", "800"], cwd=app, env=ENV, capture_output=True, text=True, check=False)
    path = os.path.join(app, "factory", "reviews", "x", "review.validated.json")
    if res.returncode != 0 or not os.path.isfile(path):
        return ["review failed: " + (res.stdout + res.stderr)[-300:]], ""
    r = json.load(open(path))
    fails = []
    if r["verdict"] != "CHANGES":
        fails.append("planted SQL injection must give CHANGES, got " + r["verdict"])
    if not any(c["file"] == "src/users.py" and c["severity"] == "important" for c in r["comments"]):
        fails.append("no important comment on src/users.py survived validation")
    return fails, open(os.path.join(app, "factory", "reviews", "x", "review.md")).read()


def runner_builder(app, wt, job, claude):
    """The builder must implement a small spec on its branch, keep to the plan, commit, and write build.md."""
    write(os.path.join(job, "spec.md"),
          "# Find by name\n\n> Feature: look users up by name\n\n- Ticket: none\n- Risk: low\n\n## Requirements\n"
          "1. `find_by_name(db, name)` in `src/users.py` returns the list of `(id,)` rows for users with that name, using a parameterised query.\n\n"
          "## Acceptance criteria\n1. `python3 -m unittest discover -s tests` passes, including a new test for `find_by_name`.\n")
    write(os.path.join(job, "plan.md"),
          "PLAN: READY\n\n# Plan: find by name\n\n## Steps\n1. `src/users.py`: add `find_by_name`.\n"
          "2. `tests/test_users.py`: add a test using an in-memory sqlite database.\n\n## Proof\n1. the new test.\n\n"
          "## Blast radius\nNothing else imports src/users.py.\n\n## Policy flags\n- Frozen paths: none\n\n## Validation\n`python3 -m unittest discover -s tests`\n")
    prompt = (f"Job folder: factory/jobs/{JOB}. Worktree: {wt}. Branch: {BRANCH}. Round: 1. Type: feature. Port: 5110.")
    tools = (f"Read,Grep,Glob,Bash(git *),Bash(cd *),Bash(python3 *),Bash(touch *),Bash(ls *),Bash(cat *),Bash(head *),Bash(wc *),Bash(find *),Bash(mkdir *),"
             f"Edit(/{wt}/**),Write(/{wt}/**),Write(factory/jobs/{JOB}/**),Edit(factory/jobs/{JOB}/**),Write(/{app}/factory/jobs/{JOB}/**),Edit(/{app}/factory/jobs/{JOB}/**)")
    # A builder runs `cd <worktree> && git ...`, which Claude Code always asks about, so it runs in auto mode, as it would in real use.
    cmd = [claude, "-p", prompt, "--agent", "builder", "--permission-mode", "auto", "--allowedTools", tools, "--add-dir", wt,
           "--output-format", "stream-json", "--verbose", "--no-session-persistence"]
    res = subprocess.run(cmd, cwd=app, env=ENV, capture_output=True, text=True, timeout=900, check=False)
    fails = []
    if SKILLS["on"]:
        used = set(re.findall(r'"name":"Skill","input":\{"skill":"([\w:-]+)"', res.stdout.replace('": "', '":"').replace('", "', '","')))
        if not any(u.endswith("tdd") for u in used):
            fails.append("builder did not call the tdd skill although it is installed; skills used: " + (", ".join(sorted(used)) or "none"))
    build = os.path.join(job, "build.md")
    if not os.path.isfile(build):
        return ["builder wrote no build.md: " + (res.stdout or res.stderr)[-200:]], ""
    if "def find_by_name" not in text(os.path.join(wt, "src", "users.py")):
        fails.append("find_by_name was not added to src/users.py")
    changed = sh(wt, "git", "diff", "--name-only", "main...HEAD").stdout.split()
    extra = [f for f in changed if f not in ("src/users.py", "tests/test_users.py")]
    if extra:
        fails.append("builder changed files outside the plan: " + ", ".join(extra))
    if "tests/test_users.py" not in changed:
        fails.append("builder added no test")
    if sh(wt, "git", "status", "--porcelain").stdout.strip():
        fails.append("builder left uncommitted changes")
    test = subprocess.run(["python3", "-m", "unittest", "discover", "-s", "tests"], cwd=wt, capture_output=True, text=True)
    if test.returncode != 0:
        fails.append("tests fail after the build: " + test.stderr[-200:])
    if "plan adherence" not in text(build).lower():
        fails.append("build.md has no Plan adherence section")
    return fails, text(build)


CASES += [
    dict(name="scanner-security finds a planted shell injection and nothing else", runner=runner_scan, job_files={}, branch_files=None),
    dict(name="pr-reviewer flags a planted SQL injection on a real line", runner=runner_review, job_files={}, branch_files=None),
    dict(name="builder implements a planned change, tests it and commits", runner=runner_builder, job_files={}, branch_files=None),
]


def run_case(case, claude, keep, verbose):
    tmp = tempfile.mkdtemp(prefix="factory-agent-evals-")
    try:
        app, wt, job = build_fixture(tmp, case["branch_files"], case.get("main_files"), case.get("drop_agents_md", False))
        for rel, body in case["job_files"].items():
            write(os.path.join(job, rel), body)
        for rel, body, msg in case.get("main_commits", []):
            write(os.path.join(app, rel), body)
            sh(app, "git", "add", "-A")
            sh(app, "git", "commit", "-qm", msg)
        if case.get("main_files") or case.get("main_commits"):
            sh(app, "git", "add", "-A")
            sh(app, "git", "commit", "-qm", "fixture", check=False)
        if "runner" in case:
            try:
                fails, shown = case["runner"](app, wt, job, claude)
            except (OSError, subprocess.TimeoutExpired) as err:
                return [f"agent did not run: {err}"]
            if verbose or fails:
                print("    --- output ---\n" + "\n".join("    " + l for l in shown.splitlines()[:14]))
            return fails
        prompt = case["prompt"].format(job=f"factory/jobs/{JOB}", wt=wt, branch=BRANCH)
        writes = [f"factory/jobs/{JOB}/**"] + case.get("write_dirs", [])
        wr = ",".join(f"{t}({r})" for r in writes for t in ("Write", "Edit")) + "," + ",".join(
            f"{t}(/{app}/{r})" for r in writes for t in ("Write", "Edit"))
        tools = f"Read,Grep,Glob,Bash(git *),Bash(cd *),Bash(python3 *),Bash(ls *),Bash(cat *),Bash(head *),Bash(wc *),Bash(find *),{wr}"
        # Worktree agents run `cd <worktree> && git ...`, which Claude Code always asks about,
        # so every case runs in auto mode, as the agents would in real use. The hooks still apply.
        cmd = [claude, "-p", prompt, "--agent", case["agent"], "--permission-mode", "auto",
               "--allowedTools", tools, "--add-dir", wt, "--output-format", "json", "--no-session-persistence"]
        try:
            res = subprocess.run(cmd, cwd=app, env=ENV, capture_output=True, text=True, timeout=900, check=False)
        except (OSError, subprocess.TimeoutExpired) as err:
            return [f"agent did not run: {err}"]
        out = os.path.join(app, case["out"][1:]) if case["out"].startswith("@") else os.path.join(job, case["out"])
        if not os.path.isfile(out):
            return [f"agent wrote no {case['out']}: {(res.stdout or res.stderr)[-200:]}"]
        allowed = (f"factory/jobs/{JOB}",) + tuple(w.rstrip("/*") for w in case.get("write_dirs", []))
        stray = [l for l in sh(app, "git", "status", "--porcelain", "--untracked-files=all").stdout.splitlines()
                 if not any(a in l for a in allowed)]
        fails = list(case["check"](text(out), job))
        if stray:
            fails.append("agent changed files outside its allowed folder: " + "; ".join(stray))
        if sh(wt, "git", "status", "--porcelain", check=False).stdout.strip():
            fails.append("agent left changes in the worktree: " + sh(wt, "git", "status", "--porcelain", check=False).stdout.strip())
        if verbose or fails:
            print("    --- output ---\n" + "\n".join("    " + l for l in text(out).splitlines()[:14]))
        return fails
    finally:
        if keep:
            print(f"    kept {tmp}")
        else:
            shutil.rmtree(tmp, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--claude", default="claude")
    parser.add_argument("--only")
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("-v", action="store_true")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--no-skills", action="store_true", help="do not install the helper skills into the fixtures")
    args = parser.parse_args()
    SKILLS["on"] = not args.no_skills
    cases = [c for c in CASES if not args.only or args.only.lower() in c["name"].lower()]
    if args.list:
        print("\n".join(c["name"] for c in cases))
        return
    bad = 0
    for case in cases:
        fails = run_case(case, args.claude, args.keep, args.v)
        print(f"{'ok  ' if not fails else 'FAIL'} {case['name']}")
        for f in fails:
            print(f"       - {f}")
        bad += bool(fails)
    print(f"\n{len(cases) - bad}/{len(cases)} agent cases passed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
