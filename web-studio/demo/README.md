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
