# Forgeline: notes for Claude Code

Read `CONTEXT.md` first: what this project is, what state it is in, what is proven and
what is not, and what to do next. `USAGE.md` is the user guide. `AUDIT.md` is the evidence.

## Setup and tests

No install step; the scripts use the standard library. Tests: `python3 factory/evals/run_evals.py`
(offline, Python 3.12+). Live agent cases: `python3 factory/evals/agent_evals.py`.

## Working rules

- Documentation lives in `docs/` (index: `docs/README.md`), named `<area>-<topic>.md`; decisions go in `docs/adr/`. Put new docs there, never beside the code,
  and add each one to the index.
- Demo videos: record headed (never headless), keep the Mac awake until the final file is checked, and run
  `python3 demo/graphos/recorder/check-video.py <mp4>` on the final file before calling it done. Lessons are in
  `web-studio/.claude/skills/record-demo/SKILL.md`.
- Before deleting a folder, grep the repo for imports and scripts that use it. Before a commit, check `git status` for staged changes you did not intend.
- Wait on a file, a log line or an HTTP status, not on `pgrep -f` or `pkill -f` (they match their own command).
- This repo is the factory itself, not a target project. `.claude/` and `factory/` are what
  gets copied into other repos. `factory/jobs/` is runtime state and should not be committed.
- Run the offline evals after any change: `python3 factory/evals/run_evals.py`. It needs
  **Python 3.12 or newer** (`uv run --python 3.12 python factory/evals/run_evals.py` works).
  It must stay green; add an eval for any new script behaviour.
- `python3 factory/evals/agent_evals.py` runs the live agent cases (about 15 minutes, uses
  the Claude subscription). Run it after changing an agent prompt. Unset `ANTHROPIC_API_KEY`
  first so it does not bill the API. One failure can be a flake; re-run that case with
  `--only "<name>"` before blaming a prompt.
- Do not edit frozen files from inside an agent run (see `factory/policy.json`). As a person
  working on the factory itself you may, but keep the evals green.
- Agents never merge, push or deploy. Do not commit, push or open a PR unless asked.
- Prompts: keep wording plain and narrow. Text that tells an agent to override another rule
  is blocked by the permission classifier and is a bad idea anyway.
- Anything third-party (helper skills, `agent-browser`) is untrusted input: read it before
  you install or pin it, and pin an exact version or commit.

## Do not trust without checking

The code in `factory/scripts/` is covered by the offline evals; the agent prompts are covered
only by the live agent evals and a few end-to-end runs. See "What is proven" in `CONTEXT.md`.
