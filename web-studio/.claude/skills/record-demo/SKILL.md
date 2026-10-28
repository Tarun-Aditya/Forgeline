---
name: record-demo
description: Make a narrated demo video of Forgeline building a feature in a sample repo (GraphQL + React): install the factory, run one real job through the web app, turn it into a replay, then record before, Forgeline, after and a code walkthrough with Playwright, captions and a Piper voice-over. Use when asked to make, redo or fix a Forgeline demo video, or to set up a sample app for demos.
---

# Record a Forgeline feature demo

This is everything learned from making `web-studio/demo/videos/forgeline-sample-demo.mp4`
(9 to 13 minutes, voice-over, captions, music bed). Follow it end to end, or jump to the step you need.
Real files: `web-studio/demo/` (`record-sample.mjs`, `run-sample-demo.sh`, `drive-job.py`,
`build-fixtures.py`, `fake-claude.py`, `mux-vo.py`, `tts.py`, `gaps.py`, `walkthrough/`).

## What the video is

1. **Before**: the sample app in a browser, what it does today, then the feature and the expected behaviour.
2. **Forgeline**: a high-level tour of the web app, then "let's build the feature with Forgeline", then the
   journey step by step (New job, accept the intent, approve the spec, the automatic stages, the human merge call).
3. **After**: the same app with the feature working.
4. **Code walkthrough**: the real diffs in an editor-style view, file by file, then the record the factory wrote.
5. Closing card.

The Forgeline part is a **replay of a real run**: the job is run once for real (costs subscription usage,
about $3.70 API-equivalent for the priority feature), then `fake-claude.py` replays it for the recording, so
re-recording is free and repeatable.

## Prerequisites

- Node 22+, python3, git, `ffmpeg` and `ffprobe` (`brew install ffmpeg`), Google Chrome (`CHROME_BIN`, default
  `/Applications/Google Chrome.app/...`), `claude` CLI logged in.
- Piper voice, once: `python3 -m venv ~/forgeline-voice/venv && ~/forgeline-voice/venv/bin/pip install piper-tts`, then
  download `en_US-hfc_female-medium.onnx` and `.onnx.json` from `rhasspy/piper-voices` (Hugging Face,
  `en/en_US/hfc_female/medium/`) into `~/forgeline-voice/`. Without `VO_PY` and `VO_MODEL` the video is silent.
- The web app built: `cd web-studio && npm install && npm run build`. Rebuild after any change under `app/`, `lib/` or `components/`.
- **Keep the Mac awake**: run everything under `caffeinate -dimsu`. A sleep in the middle of a run jumps the
  clock and the recorder times out ("timed out waiting for ...").

## Step 1: the sample repo

`/Users/tarunaditya/workspace/forgeline/forgeline-sample` (its own git repo, npm workspaces, `server/` graphql-yoga
and `web/` Vite + React + urql, vitest in both). It must be a **sibling** of the Forgeline repo, not inside it.

Install the factory into it the way USAGE.md section 3 says, with these specifics:

- Copy `.claude/` and `factory/`, but **delete `factory/evals/` before committing**. The evals hold fake credentials
  as test fixtures and the factory's own commit hook blocks the commit ("possible hard-coded credential").
  Delete it in its own command: the hook looks at the tree before the command runs.
- `factory/jobs/` empty, `factory/backlog.md` empty, add `.gitignore.factory` lines plus `__pycache__/`.
- `factory/policy.json`: `merge_policy.verify_commands`, `require_verify: true`, `test_globs: ["**/*.test.*"]`,
  `packages` (one entry per workspace with its own `verify_commands`, e.g. `npm test -w server`), and
  `worktree_setup: {"link": ["node_modules"]}` so a fresh worktree can run the tests.
- `AGENTS.md` at the root with install, test, lint, run, layout and "schema and web queries change together".
- `python3 factory/scripts/doctor.py` must show 0 FAIL. The remaining WARNs (helper skills, verify-app skill,
  managed hooks) are fine for a demo.
- Commit as "Install the Forgeline factory". That commit is the **before** state (`BEFORE_REF`).

## Step 2: run the real job (once)

1. Start the web app against the sample repo, keeping its data dir:
   `FORGELINE_WEB_DATA=/tmp/fl-sample-data FORGELINE_REPOS=<sample> npx next start -H 127.0.0.1 -p 3000`
   (run from `web-studio`, with `ANTHROPIC_API_KEY` unset).
2. Drive the three human steps with `demo/drive-job.py`, in this order, each waits until the run is finished:
   - `"<feature description>"` (writes intent.md; read it)
   - `"/factory accept <job-id>"` (writes spec.md; **read it before approving**)
   - `"/factory approve-spec <job-id>"` (plan, build, four reviews, approver; about 25 to 30 minutes)
   - if the job lands at `needs-human`: `"/factory approve <job-id>"` (merges to main through the gate)
3. Check `git log --oneline --graph` in the sample repo: builder commits, audit commits, an ADR and one merge commit.
4. A small feature that touches server, GraphQL schema and web is best (the priority field: enum, field, optional
   argument with a default, a select and a badge, tests in both packages).

Known and fixed: before `agentEnv()` in `lib/runner.ts`, the web app passed `NODE_ENV=production` to the agents, React's
`act()` then failed in the web tests, the merge gate saw a red baseline and sent the job to `needs-human` even though
the approver said APPROVE. If you run an older build, expect that stop (the recorded job has it, and the video
narrates it as the third human call).

## Step 3: make the replay fixtures

`python3 demo/build-fixtures.py <sample repo> <FORGELINE_WEB_DATA dir>` writes `demo/fixtures/` (3 or 4 runs:
start, accept, approve-spec, and optionally the final approve). `fake-claude.py` must be **executable**
(`chmod +x`, committed as mode 755), or the app says "Could not start .../fake-claude.py".
`DEMO_FIXTURES` selects another fixtures folder.

## Step 4: record

```
SAMPLE=<sample repo> BEFORE_REF=<commit before the feature> \
VO_PY=$HOME/forgeline-voice/venv/bin/python VO_MODEL=$HOME/forgeline-voice/en_US-hfc_female-medium.onnx \
PATH=/opt/homebrew/bin:$PATH caffeinate -dimsu web-studio/demo/run-sample-demo.sh
```

`run-sample-demo.sh` makes two throwaway clones at `BEFORE_REF` (one for the replayed job, one is the "before" app on
ports 4001/5174), runs the real `main` as the "after" app (4000/5173), builds `walkthrough/data.json` from the real
diffs, serves the walkthrough page on 3222, starts the web app on 3111 with `CLAUDE_BIN=fake-claude.py` at
`DEMO_SPEED=10`, runs `record-sample.mjs`, then `mux-vo.py` (voice, music, mp4). Output goes to `demo/out/`
(git-ignored); copy the final mp4 to `demo/videos/`.

Needs `playwright-core@1.56.1` and `monaco-editor@0.52.2` in `demo/.pw`. Install them in **one** `npm install --no-save`
command: `--no-save` prunes whatever else was there.

## How the recording works (so you can fix it)

- **Captions, cursor, ripple, title cards, fades** are injected by `addInitScript` and work on every origin, so
  they also appear on the sample app and the code view.
- **Voice sync**: Playwright's video runs about 12% slower than the wall clock, so voice placed by wall time drifts
  ahead. `say()` flashes a magenta square in the top-left corner at the start of each line; `mux-vo.py` finds those
  frames, starts each clip on its frame, and paints the corner dark. If the counts do not match it warns and falls back.
  (The dark corner square is visible on light pages; it is a known small blemish.)
- **tts.py** pauses: blank line = long pause, line break = short pause, sentence = small pause. Clips are cached
  by text in `demo/out/vo/`.
- **Waiting on the replay**: `until(label, test, timeout)` polls `/api/jobs`. Use `stageIs(...)`, `runDone`.
- **"Approve merge"** calls `window.confirm("Merge ... into main?")`; Playwright dismisses dialogs by default, so
  register `page.once("dialog", d => d.accept())` before clicking, or nothing happens and the run times out.
- **Code walkthrough** is `demo/walkthrough/index.html`: a VS Code style view (explorer, commits, side-by-side diff)
  on **Monaco**, the VS Code editor engine, fed with the real diffs by `build-data.py`. It is not the VS Code app.
  Say so when handing the video over. `STORY` in `build-data.py` sets the file order (contract first, then each
  side, then tests, then the record).
  The web app now has the same view built in (job card, **Code changes**, Diff or Code, see `web-studio/README.md`).
  A future cut can record that instead of this page: the replay repo needs the job's branch
  (`factory/<job-id>`, pointing at the branch tip, for example the second parent of the merge commit) and a local `main`
  so the app can find the change.

## How the script is written

The script is a **hand-written storyboard**, not model-generated: `record-sample.mjs`, from the line
`// ---- the demo ----` down. Each scene is a few lines of Playwright plus the words to show and say.

- `cap(title, text, vo, kind)` shows a short caption on screen (`title`, `text`) and speaks `vo`. If `vo` is left out,
  the title and text are read as they are. `capTop` is the same at the top of the screen (used on the code view, where the
  bottom is full of code). `kind` `"action"` makes a pink pulsing caption for the human's calls. `card(h, p, vo, eyebrow)` is a
  full-screen title card.
- **Captions are short and visual; `vo` is spoken language.** Write it as you would say it to a colleague: short
  sentences, contractions, one idea per line, "step one", "back on the Board", "I click the card". Avoid file names
  and jargon unless the screen shows them.
- **Pauses are written into the `vo` string**: a line break is a short pause, a blank line is a long pause
  (see `tts.py` below). Put a long pause between ideas and a short one between the clauses of one idea.
- **Every fact comes from the real artefacts**: read the spec, plan, decision and diffs (and the Metrics page's own
  labels in `components/metrics-view.tsx`) before you describe them. Do not state numbers the page might not show.
- Order inside a scene: caption first (so the voice starts), then the action (click, type, scroll) while the voice
  plays, then `finish()` so the scene ends only when the sentence has.
- Authoring loop: write the beats, write the narration, run, extract frames, measure the gaps, fix, run again. A full
  run is 10 to 15 minutes. The Piper clips are cached, so only changed lines are synthesised again.

## How the voice works

- **Engine**: [Piper](https://github.com/OHF-Voice/piper1-gpl), offline text to speech, voice `en_US-hfc_female-medium`.
  Nothing is sent to a service and nothing is billed. `VO_PY` is the Python that has `piper-tts`, `VO_MODEL` the `.onnx` voice.
- **`tts.py <voice.onnx> <out.wav>`** (text on stdin) speaks one `vo` string. It splits on blank lines (paragraphs)
  and line breaks (lines) and synthesises each line separately with `--sentence-silence 0.42`, `--length-scale 1.05`
  (a little slower than default), `--noise-scale 0.75`, `--noise-w 0.85`. It joins the lines into one wav with
  silence: **0.55 s after a line, 0.95 s after a paragraph**, and 0.42 s between sentences inside a line.
- **Cache**: `speak()` in the recorder names the wav by the SHA-1 of the cleaned text (`out/vo/<12 hex>.wav`) and
  reads its length with `ffprobe`. Same text, same clip. Delete `out/vo/` if you change the voice or `tts.py`.
- **Order and overlap**: `say(text)` waits until the previous line has finished (`voBusyUntil`), then notes the
  start. Lines never overlap and never queue up late.
- **Sync flash**: just before a line starts, `say()` shows a 12 px magenta square in the top-left corner for 600 ms
  and logs `{at, file, ms}` to `out/vo.json`. The recording is slower than the wall clock, so `at` is only a
  fallback. `mux-vo.py` finds the flash frames (ffmpeg `fps=25`, a 4x4 crop at the corner, red and blue high, green low,
  scaled to 1x1 per frame), and requires **exactly one flash per line**. Then it starts each clip on its flash frame
  (+100 ms). If the counts differ it prints `warning: sync flashes not matched` and falls back to wall-clock times,
  which drift ahead of the picture.
- **Mix** (`mux-vo.py`): every clip is delayed to its start with `adelay`, summed with `amix=normalize=0`, and levelled
  with `loudnorm` to about -16 LUFS. The **music bed** is synthesised (six sine tones A2 E3 A3 B3 E4 G4, low-passed at
  900 Hz, a slow tremolo and an echo, levelled to about -30 LUFS, 2.5 s fade in and 4 s fade out), so there is nothing to
  license. A `sidechaincompress` (threshold 0.02, ratio 10, attack 40 ms, release 700 ms) **ducks the music under the
  voice**. `NO_MUSIC=1` gives the voice only. Video is re-encoded to H.264 (crf 22), audio AAC 192 kbit/s, and a
  `drawbox` paints the 14 px corner so the flash never shows.
- Without `VO_PY` and `VO_MODEL` there is no voice: the recorder holds each caption for 4 s and the mp4 has no sound.

## Timing, delays and gaps

Where time goes, and what controls it:

| Source | Control |
| --- | --- |
| Voice line | its clip length (`ms`); `finish()` waits for it, plus 100 to 300 ms |
| Beat after a click | `hold(250..800)`; the cursor glide is 28 mouse steps plus a 250 ms hold, then a ripple |
| Page changes | `nav()` dips through a fade: glide, fade up (190 ms), click, fade down (260 ms) |
| Typing | `pressSequentially` with a 26 to 45 ms delay for short text; the long feature request uses `fill()` so there is no long silent typing |
| The replayed job | `DEMO_SPEED` (default 10 in `run-sample-demo.sh`): the real approve run took 26 minutes, the replay takes about 155 s, and its stage changes arrive at `t / DEMO_SPEED` |
| Playwright's own slowness | the video runs about 12% slower than the wall clock; the sync flash absorbs it |

**Gaps** (silence between narration lines) come from the replay waits, typing, page loads and deliberate holds.
The first full cut had a 2.5-minute silence while the approver ran (it is 107 s even at 10x). The fix is structural:
**never wait on a bare screen**. Keep a list of filler scenes (`fillers` in `record-sample.mjs`) that explain other
parts of the product, run them in order, skip the rest the moment the stage you wait for is reached, and only then
`until(gate)`. Fillers that need a stage first (the plan document, a review document) `until` that stage inside
themselves. After the fix the longest gap was about 8 s.

Measure it, every time, with **`demo/gaps.py`** (`DEMO_NAME=forgeline-sample-demo python3 web-studio/demo/gaps.py 5`).
The music bed hides silence from ffmpeg's `silencedetect`, and the `at` times in `out/vo.json` are **wall-clock and drift
from the video** (the recording is about 12% slower and can stall), so a gap computed from `vo.json` alone is wrong.
`gaps.py` finds the magenta sync flashes in the webm, like `mux-vo.py`, and measures each gap on the video's own
timeline. It needs one flash per line, or it refuses.

If a gap is too long, find which action caused it from the recorder log (below), then add a filler or lengthen a
narration. If narration runs a little past the stage you were waiting for, that is fine.

### Finding a stall

`record-sample.mjs` logs every caption (`cap <n> <title>`) and prints `SLOW <action> <seconds>` for any click, nav,
selectJob, viewFiles, closeDialog or finish that took over 8 s. A `finish` of 10 to 20 s is normal (it waits for the
sentence); a slow `click`, `nav` or `closeDialog` is a real stall.

One stall was seen: about 60 s with the "View files" dialog open in Step 2 of one full run, before the Accept click. It did
not happen when Steps 1 and 2 were run alone. It was not Piper (a line synthesises in about 1.5 s) and not the replay.
`closeDialog` now presses Escape, checks that no dialog is left and retries with the dialog's close button, so a stuck
dialog cannot block the next click. If it happens again, the `SLOW` line names the action.

## Storyboard rules (the person's feedback, apply every time)

- Start on the **app before the feature**: show what it does, then say the feature and the expected behaviour
  (API behaviour and web behaviour) before touching Forgeline.
- When jumping into Forgeline, **walk through the application at a high level first** (Board, New job, Agents,
  Activity, Runs, Metrics), then an explicit transition card: "now let's build our feature with Forgeline".
- **Narrate the journey step by step**, saying where you are and what you click: Step 1 New job, Step 2 Board, open the
  card, View files, Accept intent; Step 3 Agents then Board, spec.md, Approve spec; Step 4 automatic; Step 5 the third call.
- **No long silence.** The approver stage alone takes over 100 s even at 10x. Fill every wait with something
  useful: the `fillers` list in `record-sample.mjs` (Activity, the whole agent tour, search and table view, Runs live,
  the plan document, a review document, the approver). Each filler checks whether the gate is reached and skips if so.
  After recording, measure the gaps (see Verify); the target is no gap over about 8 s.
- **Give every page enough time to be explained**, including the last ones. The Metrics page must get its own
  narration (scorecard cards, then cost by day, by model and by job), not a flash.
- End with the **code walkthrough**: switch to the editor view, show the diff file by file with *why it matters*, the
  record the factory wrote (ADR, spec, plan, decision) and the commit history, then why this organisation is
  reviewable in minutes.
- Be honest on screen: a replayed run is a replay; the editor view is Monaco, not VS Code; a `needs-human` stop is
  explained as the gate doing its job.
- House style from earlier videos: Piper `en_US-hfc_female-medium` voice, short plain captions, a quiet synthesised
  music pad that ducks under the voice, fade dips between pages, `NO_MUSIC=1` for voice only.

## Verify before handing over

- The log must end with `demo finished` and contain no `FAILED`. `out/failure.png` is a screenshot of the last failure
  (it can be a stale file from an earlier run: check its time).
- Length: `ffprobe` the **mp4** (the webm reports a wrong duration).
- Silent gaps: `python3 web-studio/demo/gaps.py 5` (video timeline, not `vo.json`). Target: nothing over about 8 s, and
  no `SLOW click|nav|closeDialog` lines in the recorder log. Look at the frames around any gap that remains.
- Extract frames with `ffmpeg -ss <t> -i out/forgeline-sample-demo.mp4 -frames:v 1 -vf scale=720:-1 f.png` at the tour,
  the filler section, Step 5, Metrics, after-app and each code file, and look at them.

## Pitfalls met, and what fixed them

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Could not start fake-claude.py" | not executable | `chmod +x`, commit mode 755 |
| `setsid: command not found` | macOS has no setsid | plain `nohup ... &` and `pkill -f` cleanup |
| "timed out waiting for ..." after a long gap | Mac slept | `caffeinate -dimsu` |
| click on "Approve merge" does nothing | native confirm dialog auto-dismissed | `page.once("dialog", d => d.accept())` |
| job stops at needs-human with APPROVE | `NODE_ENV=production` leaked into the agents (fixed in `agentEnv`) | rebuild the web app; or approve as a human |
| commit blocked "possible hard-coded credential" | `factory/evals/` copied into the sample repo | delete `factory/evals/` first, in a separate command |
| `rm -rf` of a glob after `cd` refused | safety check on unresolvable globs | use a fresh directory instead of cleaning one |
| `playwright-core` vanished after installing Monaco | `npm install --no-save` prunes | install both packages in one command |
| voice ahead of the picture | wall-clock placement | sync-flash markers (already in `record-sample.mjs`) |
| 5173 or 4000 busy, app in a stale state | old dev servers still running | `pkill -f "tsx watch"; pkill -f vite`, restart before recording so seed data is clean |
| a gap measured from `vo.json` looks fine but the video has a long silence | `at` is wall-clock; the video drifts and can stall | `gaps.py` (video timeline) |
| a 60 s stall with a dialog open, seen once | cause not found; not Piper, not the replay | `closeDialog` verifies and retries; read the `SLOW` log lines |
| a bash command is blocked as a "push" though it only contains the words | the factory hook matches the text of the command | make the edit with the Edit tool instead of a shell heredoc |
| `git reset --hard` / `git push` refused in a Claude session | factory hook (destructive git, release authorization) | run it yourself in a terminal, or set `FACTORY_RELEASE_AUTHORIZED=1` when launching |

## Lessons from the GraphOS recording (each one cost hours; do not repeat them)

The GraphOS demo (`demo/graphos/`, recorder in `demo/graphos/recorder/`) uses the same kit. These apply to every demo:

| Symptom or mistake | Cause | Rule |
| --- | --- | --- |
| Bottom captions and the lower part of dialogs missing; a flat grey band under the page | **Headless Chrome 155 records only the top ~89% of the frame** (any headless mode, any Playwright version) | Record **headed with the window off-screen** (`--window-position=-3000,0` plus the three anti-throttle flags in `recorder/kit.mjs`). After every recording run `python3 demo/graphos/recorder/check-video.py <mp4>`; `run-graphos-demo.sh` already does and fails on a cut-off frame |
| Steps that normally take 1 s take 1000 s; `SLOW finish 858s`; the video is longer than the recorder log says | The **Mac slept** (the keep-awake had been released before the recording ended) | Start `caffeinate -dimsu -t <seconds>` before and keep it until the **final** mp4 is checked. Never release it right after a commit |
| "Done" said, then the user finds a cut-off video | The video was judged from the recorder log and a contact sheet, not from full-size frames | Look at full-size frames from the **final compressed file in its final folder**, near the start, middle and end, and run `check-video.py`, before saying done |
| `ERR_MODULE_NOT_FOUND ... playwright-core` after deleting an old app | The recorder borrowed Playwright from the deleted `web/node_modules` | Before deleting a folder, `grep -rn "<folder>/"` the whole repo for imports and scripts. The recorder's Playwright lives in `web-studio/demo/.pw` (install both packages in one command) |
| A wait loop never ends, or a `pkill` kills your own command | `pgrep -f` / `pkill -f` match their own shell command line | Wait on a **file, a log line or an HTTP status**, never on `pgrep -f`. Put `pkill` in its own command, and start the next command separately |
| A commit contains files from an earlier `git rm` | Staged deletions ride along with `git add <paths>` + commit | Run `git status` (index and tree) before every commit; if a `git rm` was staged earlier, commit by explicit group or `git reset` first |
| The command is refused by the factory hook | The hook scans shell text containing the words for a Git commit, and credential-looking text (`sk_live_`, `password`) in staged files | Do not put those words in scripts passed to the shell (use the edit tools), and keep credential-looking sample text out of committed files |
| The run stops mid-way: "You've hit your session limit" | The Claude subscription's session limit | Long real runs must save after each step (`golden.py` does). Check the reset time, then re-run only the remaining steps |
| Silent stretches of 20 to 40 s | A wait for a replayed run with nothing said | Never wait on a bare screen: `fill([...], done)` in `record.mjs` speaks filler lines while a run is going. Cap replay time (`DEMO_MAX_SECS=24`) |
| A recorded real run looks wrong or refused at the end | The script drifted: duplicated `main()`, no handling for a new question or a stale live layer | After editing a recording script, `python3 -c "import ast..."` and check for duplicate function names; make the tail adaptive (`golden.drive_to_export`) |
| Hours spent on the wrong UI | The target app or layout was assumed | At the start, ask which app and layout the demo is for, and look at the previous demo's frames |

Order for a GraphOS recording: keep awake, `golden.py` (real run), `build_fixtures.py`, `run-graphos-demo.sh` (records, mixes, checks), `gaps.py`, then compress into `demo/graphos/videos/` and check that file too.

## Rules of thumb

- Do not commit, push or open PRs unless asked (CLAUDE.md). When asked to commit, commit the demo scripts, the
  fixtures, the walkthrough page, this skill and the final mp4 (`demo/videos/`); leave `demo/out/`, `demo/.pw/`
  and `.DS_Store` out.
- The mp4 is large (tens of MB). GitHub rejects files over 100 MB and warns over 50 MB; if a cut grows past that, use
  Git LFS or a release asset.
- Run `npm test` in `web-studio` after touching `lib/`; keep the factory evals (`python3 factory/evals/run_evals.py`)
  green if you touch anything under `factory/`.
