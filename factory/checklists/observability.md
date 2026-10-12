# Observability checklist

Apply to a new or changed critical path: one that moves money, changes data, calls out
to another service, or runs without a person watching.

- A failure is logged once, with enough context to find it (ids, inputs that matter), not secrets.
- Errors are not swallowed; a caught error is handled, logged or re-raised on purpose.
- Log levels fit: expected conditions are not errors, real failures are not info.
- A new background job, queue or external call has a way to see success, failure and duration.
- Retries are bounded and visible; a final failure is surfaced, not dropped.
- Nothing needed to debug it lives only in a person's head: the plan or build log says where to look.
- If it needs no logging or metric, build.md says why.
