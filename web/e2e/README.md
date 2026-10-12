# e2e

Playwright tests that drive the real web app in a browser and record a video and trace of each run
(in `e2e/results/`).

```
npm run e2e                      # the offline tests below
E2E_REPO=/path/to/repo npm run e2e   # also the real-claude test
```

## fixture (always runs, offline, free)

A throwaway repo is built in the temp folder for each run, with a fake `claude` (`fake-claude.mjs`).
Nothing touches your jobs, run history or subscription.

- `answer-question.spec.ts`: an agent stops to ask "which repo?", the question shows on the job card, the
  answer on the card resumes the same session (`--resume`), and the job moves on.
- `terminal-sessions.spec.ts`: sessions started in the terminal and VS Code (fixture transcripts and activity
  log) are listed with their source, and a question from one can be answered on the job card.
- `agents-replay.spec.ts`: the Agents tab replays a finished job, draws the hand-off labels (for example
  "spec: 2 acceptance criteria") and is not "Live".

## real (only when `E2E_REPO` is set)

`feature-to-spec.spec.ts`: a feature request in a real repo is accepted at intent and becomes a spec waiting
for approval. It runs real `claude` jobs, so it uses the Claude subscription (unset `ANTHROPIC_API_KEY`) and
takes several minutes. The repo must be clean, on `main`, with the factory installed (`python3
factory/scripts/doctor.py` has no FAIL) and no existing jobs.
