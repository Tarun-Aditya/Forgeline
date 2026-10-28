# Memory: lumen_docs (Lumen Books API)

Intake: discovered from http://127.0.0.1:4010/docs (one HTML page, no spec) plus live GET probes with LUMEN_TOKEN (name only).

## Spec vs reality
- Auth: Authorization: Bearer <token>; no header gives 401.
- GET /customers/{id} exists and works but is NOT on the docs page (only implied by Order.customerId). Response has email and phone (personal data). No GET /customers or GET /authors list was documented or probed.
- Book carries undocumented fields: isbn and metadata {publisher, edition, tags}. Order carries undocumented payment {type, last4, brand}.
- GET /books: limit above 50 is clamped to 50 (200, not an error); meta {page, limit, total}. Pagination here is page/limit, but GET /orders is cursor-based (after, nextCursor, null on last page). Two styles in one API.
- Errors are {code, message}; 404 code "not_found" seen on books and authors.
- POST /orders is docs-only: not probed (write, no sandbox known). Its 201 and 422 shapes are unverified; inventory marks it needs_review.
- Sample get_customers_id/1.json holds a demo email and phone unscrubbed (example.com data); scrub before sharing outside the repo.
