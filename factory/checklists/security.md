# Security checklist

- Untrusted input (request, file, env, CLI, webhook) is validated at the edge, before use.
- Queries are parameterised; no string-built SQL, shell commands, paths or HTML.
- Every new route, job or tool checks who is calling and that they may do this to this object.
- No secrets, tokens or keys in code, logs, errors, URLs or test fixtures.
- Errors do not leak internals (stack, SQL, paths) to the caller.
- New dependencies are needed, maintained and pinned; no install scripts run unreviewed.
- Data written or sent out is limited to what the feature needs; personal data is not logged.
- File uploads and downloads: type and size limits, no path traversal, no executable content served.
- CI and workflow files: least-privilege token, no untrusted input in `run:`, actions from known owners.
- A security control (auth check, rate limit, validation) is not removed or loosened without a reason in the spec.
