# Review checklists

Reviewers read the checklist for their pass and apply only the items the diff touches.
A line that does not apply is skipped without comment. A line the diff breaks is a
finding with a file and line; a line you could not check goes under Notes. The tech
lead owns these files; agents may not edit them.

| Checklist | Read by |
| --- | --- |
| `security.md` | reviewer-security |
| `accessibility.md` | reviewer-ux, reviewer-ui |
| `performance.md` | reviewer-code |
| `observability.md` | reviewer-code |
| `testing.md` | reviewer-code |
