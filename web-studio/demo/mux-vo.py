#!/usr/bin/env python3
"""Lay the voice-over from out/vo.json onto the video, with a quiet music bed that ducks under the voice.

out/forgeline-demo.webm -> out/forgeline-demo.mp4. The music is synthesised here (a slow minor-9
pad), so there is nothing to license. Set NO_MUSIC=1 for voice only.
"""
import json, os, subprocess, sys

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
video = os.path.join(out, os.environ.get("DEMO_NAME", "forgeline-demo") + ".webm")
vo = os.path.join(out, "vo.json")
events = json.load(open(vo)) if os.path.exists(vo) else []
dst = os.path.join(out, os.environ.get("DEMO_NAME", "forgeline-demo") + ".mp4")
enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-preset", "medium"]

if not events:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, *enc, dst], check=True)
    sys.exit(0)



def sync_times(n):
    """Video-time of each sync flash (magenta corner square), or None if they cannot be found."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", "fps=25,crop=4:4:3:3,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    hot = [raw[i] > 200 and raw[i + 1] < 90 and raw[i + 2] > 200 for i in range(0, len(raw) - 2, 3)]
    ts = [i / 25 for i in range(len(hot)) if hot[i] and (i == 0 or not hot[i - 1])]
    return ts if len(ts) == n else None


dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).decode())
music = os.environ.get("NO_MUSIC") != "1"
cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", video]
for e in events:
    cmd += ["-i", e["file"]]
n = len(events)
ts = sync_times(n)
if ts:
    for e, t in zip(events, ts):
        e["at"] = t * 1000 + 100
else:
    print(f"warning: sync flashes not matched ({n} lines); using wall-clock times", file=sys.stderr)
mask = "drawbox=x=0:y=0:w=14:h=14:color=0x0b0f0d:t=fill"
if music:
    for f in (110.0, 164.81, 220.0, 246.94, 329.63, 392.0):   # A2 E3 A3 B3 E4 G4
        cmd += ["-f", "lavfi", "-t", f"{dur:.2f}", "-i", f"sine=f={f}:sample_rate=44100"]

parts = [f"[{i + 1}:a]adelay={int(e['at'])}|{int(e['at'])}[a{i}]" for i, e in enumerate(events)]
parts.append("".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=44100[vox]")
if music:
    pad = "".join(f"[{n + 1 + k}:a]" for k in range(6))
    parts.append(pad + "amix=inputs=6:normalize=0,lowpass=f=900,tremolo=f=0.11:d=0.45,aecho=0.8:0.6:90|180:0.35|0.25,"
                 f"loudnorm=I=-30:TP=-6,afade=t=in:st=0:d=2.5,afade=t=out:st={dur - 4:.2f}:d=4[bed]")
    parts.append("[vox]asplit[v1][v2]")
    parts.append("[bed][v2]sidechaincompress=threshold=0.02:ratio=10:attack=40:release=700[duck]")
    parts.append("[v1][duck]amix=inputs=2:normalize=0:duration=longest[aout]")
else:
    parts[-1] = parts[-1].replace("[vox]", "[aout]")
cmd += ["-filter_complex", ";".join(parts), "-vf", mask, "-map", "0:v", "-map", "[aout]", *enc, "-c:a", "aac", "-b:a", "192k", "-t", f"{dur:.2f}", dst]
subprocess.run(cmd, check=True)
