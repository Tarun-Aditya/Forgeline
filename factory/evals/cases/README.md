# Eval cases

`run_evals.py` (one folder up) holds the deterministic evals. They need no model
and run in seconds, so CI can run them on every change to `.claude/` or
`factory/`.

## Turn every incident into an eval

When a factory job ships something wrong or a hook lets something through:

1. Add the smallest failing check to `run_evals.py`: a new hook case in
   `eval_hooks`, a new lint in `eval_artifacts`, or a script case in
   `eval_scripts`.
2. Run it and watch it fail.
3. Fix the hook, policy or agent prompt until it passes.
4. Commit the eval and the fix together.

## Agent-level cases (not included yet)

Whether an agent *behaves* well (does the planner name the blast radius, does
the approver escalate a deploy edit) needs a model run. Add cases here as small
markdown files, each with a prompt and the regexes the output must match, and
run them non-interactively with `claude -p`, on a schedule rather than on every
commit. Start with 20 to 50 real tasks, and refresh them as models improve.
