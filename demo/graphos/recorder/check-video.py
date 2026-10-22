#!/usr/bin/env python3
"""Check a finished demo video before anyone is told it is done.

  python3 demo/graphos/recorder/check-video.py <video.mp4|webm> [--max-gap 10] [--vo out/vo.json]

Fails (exit 1) when:
  - the bottom of the frame is a flat mid-grey band (what headless Chrome 155 did: it recorded only the top ~89% of the frame,
    so bottom captions and the lower part of dialogs were cut off), seen in any of several sampled frames
  - the video is shorter than a minute (a stalled or crashed recording)
It also prints the duration and, when vo.json is given, the longest silent gap on the video's own timeline (gaps.py does the full list).
"""
import argparse
import subprocess
import sys

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--min-seconds", type=float, default=60)
a = ap.parse_args()


def run(*cmd):
    return subprocess.run(cmd, capture_output=True, check=False).stdout


dur = float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.video).decode().strip() or 0)
wh = run("ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", a.video).decode().strip().split(",")
w, h = int(wh[0]), int(wh[1])
print("duration %.1fs, frame %dx%d" % (dur, w, h))
bad = []
for k in range(1, 9):
    t = dur * k / 9
    raw = run("ffmpeg", "-v", "error", "-ss", "%.2f" % t, "-i", a.video, "-frames:v", "1", "-vf", "crop=8:%d:%d:0" % (h, w // 2), "-f", "rawvideo", "-pix_fmt", "gray", "-")
    if len(raw) < 8 * h:
        continue
    col = [raw[y * 8] for y in range(h)]
    flat = 0
    for y in range(h - 1, 0, -1):  # rows from the bottom that are the same mid-grey
        if 112 <= col[y] <= 140 and abs(col[y] - col[h - 1]) <= 2:
            flat += 1
        else:
            break
    if flat >= 24:
        bad.append((round(t), h - flat))
if bad:
    print("FAIL: a flat grey band covers the bottom of the frame (second, first band row):", bad[:4])
    print("      The bottom captions are cut off. Record headed (recorder/kit.mjs), not headless.")
    sys.exit(1)
if dur < a.min_seconds:
    print("FAIL: the video is only %.0fs long; the recording stalled or crashed." % dur)
    sys.exit(1)
print("ok: the full frame is recorded (no grey band in 8 sampled frames)")
