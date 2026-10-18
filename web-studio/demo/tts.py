#!/usr/bin/env python3
"""Speak text with Piper and keep the breaks: usage `tts.py <voice.onnx> <out.wav>` with the text on stdin.

A blank line is a paragraph break (a long pause), a line break inside a paragraph is a short pause,
and sentences get a small pause of their own, so the narrator breathes where the script does.
"""
import os, subprocess, sys, tempfile, wave

PY = os.environ.get("VO_PY", sys.executable)
SENTENCE, LINE, PARA = 0.42, 0.55, 0.95   # seconds of silence

model, out = sys.argv[1], sys.argv[2]
text = sys.stdin.read().strip()
paras = [p for p in text.split("\n\n") if p.strip()]

def synth(chunk, dst):
    subprocess.run([PY, "-m", "piper", "-m", model, "-f", dst, "--sentence-silence", str(SENTENCE),
                    "--length-scale", "1.05", "--noise-scale", "0.75", "--noise-w", "0.85"],
                   input=chunk.strip(), text=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

pieces = []  # (wav path, silence after)
with tempfile.TemporaryDirectory() as tmp:
    n = 0
    for pi, para in enumerate(paras):
        lines = [l.strip() for l in para.split("\n") if l.strip()]
        for li, line in enumerate(lines):
            dst = os.path.join(tmp, f"{n}.wav"); n += 1
            synth(line, dst)
            gap = PARA if li == len(lines) - 1 else LINE
            pieces.append((dst, gap if not (pi == len(paras) - 1 and li == len(lines) - 1) else 0.0))
    with wave.open(pieces[0][0]) as w0:
        params = w0.getparams()
    with wave.open(out, "wb") as w:
        w.setparams(params)
        for path, gap in pieces:
            with wave.open(path) as r:
                w.writeframes(r.readframes(r.getnframes()))
            w.writeframes(b"\x00" * int(params.framerate * gap) * params.sampwidth * params.nchannels)
