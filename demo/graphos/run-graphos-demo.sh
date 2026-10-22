#!/usr/bin/env bash
# Records the GraphOS demo video (video/record.mjs): the web app in GraphOS mode taking the Lumen Books REST API to an
# exported Apollo subgraph, with every agent run replayed from the real golden run (fake_claude.py + fixtures/).
#
# Before this: python3 demo/graphos/golden.py (the real run, once), then python3 demo/graphos/build_fixtures.py.
# Needs: Node 22+, python3, ffmpeg, Chrome (CHROME_BIN), the web app's dependencies (cd web-studio && npm install), and optionally
# Piper (VO_PY, VO_MODEL) for the voice. Run it under caffeinate: a sleeping Mac makes the recorder time out.
#
#   VO_PY=$HOME/forgeline-voice/venv/bin/python VO_MODEL=$HOME/forgeline-voice/en_US-hfc_female-medium.onnx \
#   caffeinate -dimsu demo/graphos/run-graphos-demo.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PORT="${DEMO_PORT:-3111}"
REPO="${DEMO_REPO:-/tmp/gx-demo-repo}"
DATA="$(mktemp -d)"
export DEMO_URL="http://127.0.0.1:$PORT" DEMO_REPO="$REPO" DEMO_NAME="${DEMO_NAME:-forgeline-graphos-demo}"
export DEMO_SPEED="${DEMO_SPEED:-10}" DEMO_MAX_SECS="${DEMO_MAX_SECS:-40}"
[ -f "$HERE/fixtures/timeline.json" ] || { echo "no fixtures: run golden.py then build_fixtures.py first" >&2; exit 1; }
chmod +x "$HERE/fake_claude.py"

cleanup() { pkill -f "next start -H 127.0.0.1 -p $PORT" 2>/dev/null || true; pkill -f "demo/graphos/server.py" 2>/dev/null || true; }
cleanup; trap cleanup EXIT

# 1. a scratch repo the replay can write into: the factory files the web app needs, the demo API, no history of ours
rm -rf "$REPO"; mkdir -p "$REPO"
rsync -a --exclude node_modules --exclude .next --exclude .git --exclude /graphos --exclude /graphos-demo --exclude /graphos-exports --exclude /web-studio \
  --exclude /factory/jobs --exclude /factory/activity --exclude /demo/graphos/fixtures --exclude /demo/graphos/video/out "$ROOT/" "$REPO/"
mkdir -p "$REPO/factory/jobs" "$REPO/factory/activity"
git -C "$REPO" init -q -b main
git -C "$REPO" -c user.name=demo -c user.email=demo@example.com add -A
git -C "$REPO" -c user.name=demo -c user.email=demo@example.com commit -q -m "Install the Forgeline factory"

# 2. the web app, built once, replaying the golden run
cd "$ROOT/web-studio"
[ -d .next ] || npm run build >/dev/null
env -u ANTHROPIC_API_KEY CLAUDE_BIN="$HERE/fake_claude.py" DEMO_FIXTURES="$HERE/fixtures" FORGELINE_WEB_DATA="$DATA" \
  FORGELINE_REPOS="$REPO" FORGELINE_GRAPHOS_DIR=graphos-demo FORGELINE_ELV2_ACCEPTED=1 LUMEN_TOKEN=lumen-demo-token \
  nohup npx next start -H 127.0.0.1 -p "$PORT" >"$DATA/web.log" 2>&1 &
for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORT/api/repos" >/dev/null && break; sleep 1; done

# 3. record, then lay the voice on
rm -f "$HERE/video/out/vo.json"
node "$HERE/video/record.mjs"
command -v ffmpeg >/dev/null && DEMO_NAME="$DEMO_NAME" python3 "$HERE/video/mux-vo.py"
ls -lh "$HERE/video/out"
