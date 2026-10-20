# Demo video

`run-demo.sh` records a Playwright video of the web app: every page, one job from request to merge,
the Agents view at each stage, what each stage produces and the two approvals a person gives.

No model is called and nothing is billed. The app runs against `fake-claude.py`, which replays a real
job that was driven from the web app (`fixtures/`, made by `build-fixtures.py`) in a throwaway repo, so
the Board, Agents, Activity, Runs and Metrics pages all fill in from real files and a real activity log.

```
npm run build               # once, in web/
web/demo/run-demo.sh        # -> web/demo/out/forgeline-demo.webm and .mp4 (about 4 minutes)
DEMO_SPEED=2 web/demo/run-demo.sh   # slower replay
```

Needs Node 22, python3, ffmpeg (for the mp4) and a Chromium: set `CHROME_BIN`, or run
`npx playwright install chromium`. `record.mjs` holds the script (captions, cursor, timing).

To record a different job, run a real job from the web app against a repo, then
`python3 web/demo/build-fixtures.py <repo> <FORGELINE_WEB_DATA dir>` and edit the captions in `record.mjs`.

## Voice-over

Every caption and title card can be narrated with [Piper](https://github.com/OHF-Voice/piper1-gpl) (offline text to speech).
Install `piper-tts` in a venv, download a voice (for example `en_US-lessac-medium.onnx` and its `.json`
from `rhasspy/piper-voices` on Hugging Face), then:

```
VO_PY=/path/to/venv/bin/python VO_MODEL=/path/to/voice.onnx web/demo/run-demo.sh
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
