---
name: incident-postmortem
description: Write a blameless postmortem from a maintain-loop incident, its diagnosis and the fix job. Use after a breach has been resolved.
---

# Blameless postmortem

Source material: `factory/maintain/breaches/<id>/` (breach.json, incident.md,
diagnosis.md) and the job that fixed it in `factory/audit/`.

Write `docs/postmortems/<date>-<metric>.md` with:

1. **Summary**: what broke, for how long, who was affected. Three sentences.
2. **Timeline** with timestamps from the breach record and git history: detected,
   diagnosed, intent accepted, fix merged, metric recovered.
3. **Cause**: the diagnosis, corrected by what the fix actually changed. Say what
   the diagnoser got right or wrong.
4. **What went well and what did not**: detection speed, whether the band was
   right, whether the runbook existed.
5. **Actions**: each one concrete and owned. Include at least one of: a new eval
   case under `factory/evals/cases/`, a band change, or a new runbook.
6. Blameless: describe systems and decisions, never people.
Do not invent facts. If the record does not say, write "not recorded".
