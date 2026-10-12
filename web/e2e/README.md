# e2e

One real use case: a feature request in a real repo is accepted at intent and becomes a spec waiting for approval.

```
E2E_REPO=/path/to/repo-with-factory npx playwright test
```

It runs a real `claude` job through the web app, so it uses the Claude subscription (unset
`ANTHROPIC_API_KEY`) and takes several minutes. The repo must be clean, on `main`, with the
factory installed (`python3 factory/scripts/doctor.py` has no FAIL) and no existing jobs.
Video and trace land in `e2e/results/`.
