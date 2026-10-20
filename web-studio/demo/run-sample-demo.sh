#!/usr/bin/env bash
# Records the "build a feature with Forgeline" demo (record-sample.mjs): a small GraphQL + React task app
# before the feature, a replay of the real Forgeline job that built it, and the app after.
#
# The job is replayed (fake-claude.py + fixtures/, made by build-fixtures.py from a real run); no model is called.
#
# Needs: the forgeline-sample repo (BEFORE_REF = the commit before the feature, AFTER = its main checkout with
# `npm run dev` already stopped), Node 22, python3, ffmpeg, Chrome (CHROME_BIN) and optionally Piper (VO_PY, VO_MODEL).
#
#   SAMPLE=/path/to/forgeline-sample BEFORE_REF=0a8f6eb VO_PY=... VO_MODEL=... web-studio/demo/run-sample-demo.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="$(cd "$HERE/.." && pwd)"
SAMPLE="${SAMPLE:?set SAMPLE to the forgeline-sample repo}"
BEFORE_REF="${BEFORE_REF:?set BEFORE_REF to the commit before the feature}"
PORT="${DEMO_PORT:-3111}"
REPO="${DEMO_REPO:-/tmp/fl-replay-repo}"
BEFORE="${BEFORE_DIR:-/tmp/fl-before-app}"
DATA="$(mktemp -d)"
export DEMO_SPEED="${DEMO_SPEED:-10}" DEMO_REPO="$REPO" DEMO_URL="http://127.0.0.1:$PORT" DEMO_NAME=forgeline-sample-demo
cleanup() { pkill -f "tsx watch" 2>/dev/null || true; pkill -f "vite" 2>/dev/null || true; pkill -f "npm-run-all" 2>/dev/null || true; pkill -f "next start" 2>/dev/null || true; pkill -f "http.server 3222" 2>/dev/null || true; }
cleanup; trap cleanup EXIT

[ -d "$HERE/.pw/node_modules/playwright-core" ] && [ -d "$HERE/.pw/node_modules/monaco-editor" ] || npm install --no-save --no-audit --no-fund --prefix "$HERE/.pw" playwright-core@1.56.1 monaco-editor@0.52.2 >/dev/null

# 1. throwaway repo for the replayed job, and a copy of the app as it was before the feature
for d in "$REPO" "$BEFORE"; do
  rm -rf "$d"; git clone -q --no-checkout "$SAMPLE" "$d"
  git -C "$d" checkout -q -b demo "$BEFORE_REF"
  git -C "$d" config user.email demo@example.com; git -C "$d" config user.name demo
done
mkdir -p "$REPO/factory/jobs" "$REPO/factory/activity"
ln -s "$SAMPLE/node_modules" "$BEFORE/node_modules"
sed -i.bak "s#localhost:4000#localhost:4001#; s#port: 5173#port: 5174#" "$BEFORE/web/vite.config.ts"; rm -f "$BEFORE/web/vite.config.ts.bak"

# 2. the apps: before on 4001/5174, after (the merged main) on 4000/5173
(cd "$BEFORE" && PORT=4001 nohup npm run dev >"$DATA/before.log" 2>&1 &)
(cd "$SAMPLE" && nohup npm run dev >"$DATA/after.log" 2>&1 &)

# the code walkthrough page: real diffs of the merged job, served locally
python3 "$HERE/walkthrough/build-data.py" "$SAMPLE" "$BEFORE_REF" "$(git -C "$SAMPLE" rev-parse HEAD)"
(cd "$HERE" && nohup python3 -m http.server 3222 --bind 127.0.0.1 >"$DATA/walkthrough.log" 2>&1 &)

# 3. Forgeline's web app, replaying the job
cd "$WEB"
env -u ANTHROPIC_API_KEY CLAUDE_BIN="$HERE/fake-claude.py" FORGELINE_WEB_DATA="$DATA" FORGELINE_REPOS="$REPO" \
  nohup npx next start -H 127.0.0.1 -p "$PORT" >"$DATA/studio.log" 2>&1 &
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$PORT/api/repos" >/dev/null && curl -sf localhost:4001/graphql -o /dev/null -H 'content-type: application/json' -d '{"query":"{__typename}"}' \
    && curl -sf localhost:5174 >/dev/null && curl -sf localhost:5173 >/dev/null && break
  sleep 1
done

rm -f "$HERE/out/vo.json"
node "$HERE/record-sample.mjs"
command -v ffmpeg >/dev/null && python3 "$HERE/mux-vo.py"
ls -lh "$HERE/out"
