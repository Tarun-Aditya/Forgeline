#!/usr/bin/env python3
"""Turn a merged job's accepted Design section into a durable decision record.

Called by merge_gate.py after a successful merge. It reads factory/jobs/<job-id>/spec.md,
and when the spec has a real `## Design` section (not "Not architectural") it writes
<dir>/NNNN-<slug>.md in the repo and commits it on the base branch. policy.adr.dir sets
the folder (default docs/adr); an empty string turns it off. The record is the spec's
words, unchanged: nobody rewrites the decision after the fact.
"""

import datetime
import json
import os
import re
import subprocess


def design_section(spec_text):
    """The body of `## Design`, or None when absent, empty or marked not architectural."""
    m = re.search(r"^## Design\s*\n(.*?)(?=^## |\Z)", spec_text, re.S | re.M)
    if not m:
        return None
    body = m.group(1).strip()
    if not body or body.lower().startswith("not architectural"):
        return None
    return body


def title_of(spec_text, fallback):
    m = re.search(r"^#\s+(.+)$", spec_text, re.M)
    return m.group(1).strip() if m else fallback


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:50] or "decision"


def record(repo, factory, job_id, policy, base, git):
    """Write and commit the ADR. Returns a note string, or None when there is nothing to record."""
    adr_dir = (policy.get("adr") or {}).get("dir", "docs/adr")
    if not adr_dir:
        return None
    spec_path = os.path.join(factory, "jobs", job_id, "spec.md")
    if not os.path.isfile(spec_path):
        return None
    with open(spec_path, encoding="utf-8") as fh:
        spec = fh.read()
    design = design_section(spec)
    if design is None:
        return None
    folder = os.path.join(repo, adr_dir)
    os.makedirs(folder, exist_ok=True)
    taken = [int(m.group(1)) for n in os.listdir(folder) for m in [re.match(r"(\d{4})-", n)] if m]
    number = max(taken, default=0) + 1
    title = title_of(spec, job_id)
    ticket = re.search(r"^- Ticket:\s*(.+)$", spec, re.M)
    name = f"{number:04d}-{slugify(title)}.md"
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    text = (f"# ADR {number:04d}: {title}\n\n- Status: Accepted\n- Date: {today}\n- Job: {job_id} "
            f"(full record: factory/audit/{job_id}/)\n- Ticket: {ticket.group(1).strip() if ticket else 'none'}\n\n{design}\n")
    with open(os.path.join(folder, name), "w", encoding="utf-8") as fh:
        fh.write(text)
    rel = os.path.join(adr_dir, name)
    added = git(repo, "add", rel)
    done = git(repo, "commit", "-m", f"adr: {job_id} {title}", "--", rel)
    if added.returncode != 0 or done.returncode != 0:
        return f"ADR written to {rel} but not committed: {(done.stderr or added.stderr).strip()[:160]}"
    return f"ADR recorded: {rel}"
