#!/usr/bin/env python3
"""Lay the voice-over lines recorded in out/vo.json onto the video: out/forgeline-demo.webm -> out/forgeline-demo.mp4."""
import json, os, subprocess, sys

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
video = os.path.join(out, "forgeline-demo.webm")
events = json.load(open(os.path.join(out, "vo.json"))) if os.path.exists(os.path.join(out, "vo.json")) else []
dst = os.path.join(out, "forgeline-demo.mp4")
enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "medium"]

if not events:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, *enc, dst], check=True)
    sys.exit(0)

cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", video]
for e in events:
    cmd += ["-i", e["file"]]
delays = ";".join(f"[{i + 1}:a]adelay={int(e['at'])}|{int(e['at'])},volume=1.6[a{i}]" for i, e in enumerate(events))
mix = "".join(f"[a{i}]" for i in range(len(events))) + f"amix=inputs={len(events)}:normalize=0:duration=longest[aout]"
cmd += ["-filter_complex", delays + ";" + mix, "-map", "0:v", "-map", "[aout]", *enc, "-c:a", "aac", "-b:a", "160k", "-shortest", dst]
subprocess.run(cmd, check=True)
