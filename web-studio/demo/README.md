# Demo video

`run-demo.sh` records a Playwright video of the web app: every page, one job from request to merge,
the Agents view at each stage, what each stage produces and the two approvals a person gives.

No model is called and nothing is billed. The app runs against `fake-claude.py`, which replays a real
job that was driven from the web app (`fixtures/`, made by `build-fixtures.py`) in a throwaway repo, so
the Board, Agents, Activity, Runs and Metrics pages all fill in from real files and a real activity log.

```
npm run build               # once, in web-studio/
web-studio/demo/run-demo.sh        # -> web-studio/demo/out/forgeline-demo.webm and .mp4 (about 4 minutes)
DEMO_SPEED=2 web-studio/demo/run-demo.sh   # slower replay
```

Needs Node 22, python3, ffmpeg (for the mp4) and a Chromium: set `CHROME_BIN`, or run
`npx playwright install chromium`. `record.mjs` holds the script (captions, cursor, timing).

To record a different job, run a real job from the web app against a repo, then
`python3 web-studio/demo/build-fixtures.py <repo> <FORGELINE_WEB_DATA dir>` and edit the captions in `record.mjs`.

## Voice-over

Every caption and title card can be narrated with [Piper](https://github.com/OHF-Voice/piper1-gpl) (offline text to speech).
Install `piper-tts` in a venv, download a voice (for example `en_US-lessac-medium.onnx` and its `.json`
from `rhasspy/piper-voices` on Hugging Face), then:

```
VO_PY=/path/to/venv/bin/python VO_MODEL=/path/to/voice.onnx web-studio/demo/run-demo.sh
```

`record.mjs` waits for each line to finish before the next caption appears and writes `out/vo.json`;
`mux-vo.py` lays the lines onto the video. Without those two variables the video is silent.

- **Pauses:** `tts.py` speaks each line. In a `vo` string in `record.mjs`, a line break is a short
  pause and a blank line is a long one; sentences get a small pause of their own.
- **Sync:** the recording plays slower than the wall clock, so `record.mjs` flashes a magenta square
  in the top-left corner at the start of every line. `mux-vo.py` finds those frames, starts each clip
  on its frame, then paints the corner over. If it cannot match every flash it warns and falls back
  to wall-clock times, which drift.
- **Music:** `mux-vo.py` adds a quiet synthesised pad (nothing to license) that ducks under the
  voice. `NO_MUSIC=1` gives voice only.
- **Length:** `DEMO_SPEED=10` shortens the waits on the replayed job (about 5:40 in total instead of 8).
  The voice used for the shipped cut was `en_US-hfc_female-medium`.

## Two demos

| | Script | Run with | Shows |
| --- | --- | --- | --- |
| Product tour | `record.mjs` | `run-demo.sh` | every page, one job on a tiny Python repo (`setup-repo.sh`), the two approvals |
| **Feature demo** | `record-sample.mjs` | `run-sample-demo.sh` | a sample GraphQL + React app **before**, Forgeline building a feature in it, the app **after**, then a code walkthrough of the real diffs |

The rest of this file is about the feature demo. The step-by-step procedure, every lesson learned and the
pitfalls are in the skill: `web-studio/.claude/skills/record-demo/SKILL.md`. Read it before redoing a video.

## Feature demo

```
SAMPLE=/path/to/forgeline-sample BEFORE_REF=<commit before the feature> \
VO_PY=$HOME/forgeline-voice/venv/bin/python VO_MODEL=$HOME/forgeline-voice/en_US-hfc_female-medium.onnx \
PATH=/opt/homebrew/bin:$PATH caffeinate -dimsu web-studio/demo/run-sample-demo.sh
# -> demo/out/forgeline-sample-demo.mp4 (copy the final cut to demo/videos/)
```

1. **A real job, once.** The sample repo (`forgeline-sample`, npm workspaces: `server/` graphql-yoga, `web/` Vite + React + urql)
   has the factory installed. Run the feature through the web app with `drive-job.py` (start, accept, approve-spec,
   approve). That costs real subscription usage (about $3.70 API-equivalent for the priority feature).
2. **Fixtures.** `build-fixtures.py <repo> <data dir>` turns that run into `fixtures/`. `fake-claude.py` replays it
   (3 or 4 runs) at `DEMO_SPEED` (10 in the run script), so re-recording is free and repeatable.
3. **Record.** `run-sample-demo.sh` clones the sample at `BEFORE_REF` for the "before" app (ports 4001/5174) and for the
   replayed job, runs the real `main` as the "after" app (4000/5173), builds `walkthrough/data.json` from the real diffs,
   serves the code view on 3222, starts the web app on 3111 against `fake-claude.py`, runs `record-sample.mjs` and then
   `mux-vo.py`.

Storyboard: the app before and the feature with its expected behaviour; a high-level tour of Forgeline; "now let's build
the feature"; five steps (describe, accept the intent, approve the spec, the automatic stages, the human merge call),
each saying where you are and what you click; filler scenes during the long approver wait; the Metrics page explained;
the app after; the code walkthrough; a closing card.

`walkthrough/` is a VS Code style view (explorer, commits, side-by-side diff) on **Monaco**, the VS Code editor
engine, fed with the real diffs of the merged job. It is not the VS Code application.

## How the script and the voice work

- **Script.** The storyboard is hand-written in `record-sample.mjs`. `cap(title, text, vo)` puts a short caption on screen
  and speaks `vo`, which is written as spoken language. In `vo`, a line break is a short pause and a blank line is a
  long one. Every scene ends with `finish()` so a scene never starts mid-sentence.
- **Voice.** Piper reads each line (`tts.py`), with 0.42 s between sentences, 0.55 s between lines and 0.95 s between
  paragraphs; clips are cached by the SHA-1 of their text in `out/vo/`. `say()` never lets two lines overlap.
- **Sync.** Playwright's video is about 12% slower than the wall clock, so before every line the recorder flashes a magenta
  square in the corner, and `mux-vo.py` starts the clip on that frame (it needs exactly one flash per line, or it warns and
  falls back to wall-clock times).
- **Mix.** Voice levelled to about -16 LUFS; a synthesised music pad at about -30 LUFS that ducks under the voice
  (`sidechaincompress`); H.264 + AAC; the corner marker is painted over.
- **Gaps.** The replayed approver takes about 107 s even at 10x, so the recorder never waits on a bare screen: it runs
  `fillers` (Activity, the agent tour, search, Runs, the plan and review documents, the approver) and skips the rest
  once the stage it waits for arrives. Check the result with `python3 gaps.py 5`, which measures on the video's own
  timeline (the times in `out/vo.json` are wall-clock and drift); the target is no gap over about 8 s. The recorder logs
  `SLOW <action>` for anything that takes over 8 s, which is how a stall is traced to its cause.
- **Replay speed.** `DEMO_SPEED=10` divides the recorded stage times; the 26-minute approve run replays in about 155 s.

## Gotchas

- `fake-claude.py` must be executable; the web app says "Could not start ..." otherwise.
- The "Approve merge" button asks `window.confirm`; the recorder accepts it with `page.once("dialog", ...)`.
- Run under `caffeinate -dimsu`: a sleeping Mac makes the waits time out.
- `demo/.pw` needs `playwright-core` and `monaco-editor` installed in one `npm install --no-save` (it prunes otherwise).
- Do not copy `factory/evals/` into the sample repo: its fake credentials trip the commit hook.
- Since `agentEnv()` in `lib/runner.ts`, the web app no longer passes `NODE_ENV=production` to the agents. Before that fix a
  JS repo's tests could fail in the merge gate's baseline check and the job stopped at `needs-human`.
- The final cut is in `videos/forgeline-sample-demo.mp4`; `out/` and `.pw/` are git-ignored.
