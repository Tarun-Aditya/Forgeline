# Human approval

User instruction (verbatim): `/factory approve 001-task-priority`

Time (UTC): 2026-10-20T15:14:35Z

decision.md first line: APPROVE

Why: Additive, backward-compatible GraphQL change (new enum, new output field, optional argument with SDL default) mirrored in the web queries and UI. Spec risk low; lint, server 13/13 and web 6/6 re-run by the approver; all four round-1 reviews PASS; policy_check CLEAN.
