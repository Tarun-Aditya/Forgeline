#!/usr/bin/env bash
# Records the demo video. No model is called: the app runs against fake-claude.py, which replays
# the recorded job in fixtures/ (see build-fixtures.py).
#
#   web/demo/run-demo.sh            -> web/demo/out/forgeline-demo.webm (and .mp4 if ffmpeg exists)
#   DEMO_SPEED=2 web/demo/run-demo.sh   slower replay (default 3x the recording)
#
# Needs: the web app built (npm run build in web/), python3, node 22, and a Chromium
# (set CHROME_BIN, or run `npx playwright install chromium`).
# Optional voice-over: VO_PY=<python with piper-tts> VO_MODEL=<voice.onnx> (see README).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="$(cd "$HERE/.." && pwd)"
PORT="${DEMO_PORT:-3111}"
REPO="${DEMO_REPO:-/tmp/forgeline-demo-repo}"
DATA="$(mktemp -d)"
export DEMO_SPEED="${DEMO_SPEED:-3}" DEMO_REPO="$REPO" DEMO_URL="http://127.0.0.1:$PORT"

[ -d "$HERE/.pw/node_modules/playwright-core" ] || npm install --no-save --no-audit --no-fund --prefix "$HERE/.pw" playwright-core@1.56.1 >/dev/null
"$HERE/setup-repo.sh" "$REPO"

cd "$WEB"
env -u ANTHROPIC_API_KEY CLAUDE_BIN="$HERE/fake-claude.py" FORGELINE_WEB_DATA="$DATA" FORGELINE_REPOS="$REPO" \
  setsid npx next start -H 127.0.0.1 -p "$PORT" >"$DATA/server.log" 2>&1 &
SERVER=$!
trap 'kill -- -$SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do curl -sf "http://127.0.0.1:$PORT/api/repos" >/dev/null && break; sleep 0.5; done

rm -f "$HERE/out/vo.json"   # narration clips in out/vo are cached by text
node "$HERE/record.mjs"

# Voice-over: set VO_PY (a python with piper-tts) and VO_MODEL (a Piper .onnx voice) to narrate the video.
if command -v ffmpeg >/dev/null; then
  python3 "$HERE/mux-vo.py"
fi
ls -lh "$HERE/out"
