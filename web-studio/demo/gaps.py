#!/usr/bin/env python3
"""Silent gaps between narration lines, on the VIDEO's own timeline.

Usage: gaps.py [min-seconds]   (default 5)    reads out/<DEMO_NAME>.webm and out/vo.json

vo.json has wall-clock start times, which drift from the video (the recording is slower than the wall clock, and can
stall), so this finds the magenta sync flashes in the webm, exactly as mux-vo.py does, and measures the gap between
the end of each clip and the start of the next on that timeline. The music bed hides silence from ffmpeg's
silencedetect, so use this instead.
"""
import json, os, subprocess, sys

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
video = os.path.join(out, os.environ.get("DEMO_NAME", "forgeline-sample-demo") + ".webm")
events = json.load(open(os.path.join(out, "vo.json")))
limit = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0

raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", "fps=25,crop=4:4:3:3,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                     capture_output=True, check=True).stdout
hot = [raw[i] > 200 and raw[i + 1] < 90 and raw[i + 2] > 200 for i in range(0, len(raw) - 2, 3)]
starts = [i / 25 for i in range(len(hot)) if hot[i] and (i == 0 or not hot[i - 1])]
if len(starts) != len(events):
    sys.exit(f"found {len(starts)} sync flashes for {len(events)} lines; cannot measure")

prev_end, worst = 0.0, []
for s, e in zip(starts, events):
    if s - prev_end > limit:
        worst.append((round(s - prev_end, 1), round(s, 1)))
    prev_end = s + e["ms"] / 1000
print(f"{len(events)} lines, last ends at {prev_end:.0f}s; gaps over {limit:g}s (length, line starts at):")
for g in worst:
    print("  ", g)
if not worst:
    print("   none")
