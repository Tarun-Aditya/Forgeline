"""Shared helpers for the maintain loop scripts. Standard library only."""

import json
import os
from datetime import datetime, timezone


def parse_time(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def now_utc():
    return datetime.now(timezone.utc)


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")
    os.replace(tmp, path)


def load_state(maintain_dir):
    return load_json(os.path.join(maintain_dir, "state.json"), {"metrics": {}})


def save_state(maintain_dir, state):
    save_json(os.path.join(maintain_dir, "state.json"), state)
