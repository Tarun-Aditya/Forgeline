VERDICT: CHANGES

Schema review of `lumen-books.graphql` at HEAD c9db42f. Evidence run 2026-10-21T19-22-11-603Z was recorded at 4015647. Between 4015647 and HEAD only evidence files changed, so the evidence is current.

Summary: 2 blockers, 5 should-fix, 5 nits.

## Changes since the previous review

Findings from the previous review that are now resolved:
- `@listSize` is now on `lumen_books_books` and `lumen_books_orders` (lines 284 and 436).
- `refundOrder` replaces `updateOrder`, following the API 2.0.0 refresh (D-x4ukx1).
- The payment input says which member each type requires (lines 252-257).
- Date and date-time formats are described on the fields (lines 102, 162, 218).
- `cancelOrder` now has a unit entry.
- Live runs against the real API: 8 read cases pass, including `books_by_ids`. That case confirms the open point of D-x1ekw6, that the API accepts `ids` together with `limit=50`.

Findings that the user decided to keep:
- `OrderItem.book` stays a per-item connector (D-doncxi: field).
- `Book.author` stays a relationship field, which is why lint still warns `link-key-drift` (D-yqmrto: field).
- `webhookUrl` stays exposed (D-88ripv: keep).
- `iban` stays exposed (D-a39c6a: expose).

None of these is raised again below as a design problem.

## What is right

- Naming follows `naming.md`: `Lumen_Books_*` types and `lumen_books_<camelCase>` fields. Enums stay in wire casing (F-jx72bt).
- The fields that the decisions omit are absent: `metadata`, `email`, `phone` and `apiKey`.
- Book and Author are the only entities. Each one's `@key(fields: "id")` field is in its connector's selection. There is no `@shareable`.
- Output fields and mutation payloads are nullable, so a failed write surfaces as null plus an error.
- The `@source` errors block carries `message`, `code` and `httpStatus`. e2e executes every documented 401, 404, 409 and 422, with none `not_run`.
- Compose, unit (67), e2e (33), write_body_proof, conformance (60 pass, 1 waived), json_accounting and live (8) all pass.

## Findings

### 1. blocker: the resolved auth decision D-8b2878 (forward the caller's token) is not applied
- File: `lumen-books.graphql:18`, `template.yaml:5-7`
- D-8b2878 is resolved as `forward`. The schema still sends one service bearer token (`Bearer {{AUTH_EXPR}}`, test default `{$env.LUMEN_BOOKS_TOKEN}`). F-tjc0x5 records that the apply step left this in place deliberately and that the decision cannot be carried out through AUTH_EXPR at export.
- Until this is fixed, any client the supergraph admits can do the following:
  - read any customer's orders (`lumen_books_orders(customerId:)`, line 426),
  - read full IBANs (line 207),
  - read customer names (line 405) and integration webhook URLs (line 236),
  - create, refund and cancel orders (lines 522, 574, 612).

  This is the exposure the user chose to close.
- Fix: choose (a) or (b).
  - (a) Carry out the decision in the schema, as F-tjc0x5 describes:
    - In `@source`, replace `{ name: "Authorization", value: "Bearer {{AUTH_EXPR}}" }` with `{ name: "Authorization", from: "Authorization" }`.
    - Remove AUTH_EXPR from `template.yaml`.
    - Give unit, e2e and live a caller token. The unit `connectorRequest.headers.authorization` expectations change as well.
    - Re-run every layer.
  - (b) If the user does not want the placeholder contract to change, reopen D-8b2878 (`graphos-factory-core decisions reopen . --id D-8b2878`) and resolve it as `router-auth` or `keep`, recording the reason.

  Do not export while the decision and the schema disagree.

### 2. blocker: the sizes chosen in D-q0zlfg are missing, so the per-item fan-out from `OrderItem.book` is unmetered
- File: `lumen-books.graphql:215` (`Lumen_Books_Order.items`), `174` (`OrderItem.book`), `348-353` (`lumen_books_searchBooks`)
- D-zkxfd4 resolved as `add`, and D-q0zlfg resolved as `sizes`: the user will give an `assumedSize` for `searchBooks` and for `Order.items`. The note says only "demo answer", no numbers were recorded, and commit 4015647 says "no schema change". Neither field has a `@listSize`.
- D-doncxi kept `OrderItem.book` as one `GET /books/{bookId}` per order item. As a result, `lumen_books_orders(limit: 50) { data { items { book { id } } } }` sends 50 × (items per order) upstream requests, and the router's demand control has no size for `items` to cost that with. This is the unbounded fan-out from a link field that the security check forbids. The user chose to accept it on condition that the sizes are applied.
- Fix: get the two numbers from the user or the API owner, then add:
  - `items: [Lumen_Books_OrderItem] @listSize(assumedSize: <max items per order>)` (line 215)
  - `@listSize(assumedSize: <searchBooks page size>)` on `lumen_books_searchBooks` (line 348)

  Record the numbers in D-q0zlfg's note. Do not guess them. If the user cannot give them, reopen D-q0zlfg and resolve it as `none`, so that the risk is recorded rather than implied.

### 3. should: paging arguments do not declare the source defaults
- File: `lumen-books.graphql:274`, `276`, `434`
- The spec defaults are `page` = 1 and `limit` = 10 on `/books` and `/orders`. Those defaults appear only in the descriptions. Demand control uses the `limit` slicing argument, so when the caller omits `limit` it has no value to multiply by.
- Fix: declare `page: Int = 1` and `limit: Int = 10` on `lumen_books_books`, and `limit: Int = 10` on `lumen_books_orders`. The requests sent to the API do not change.

### 4. should: no unit entry for createOrder (lint `missing-unit`)
- File: `lumen-books.graphql:522`, `tests/lumen-books.connector.yaml`
- `post:/orders` reports `unit: n/a` in the evidence. Refund and cancel have entries; createOrder does not.
- Fix: add a `rover connector test` entry for `Mutation.lumen_books_createOrder` that asserts the method, URL, bearer header and body. Include a card payment, so that the `payment: $args.payment? { ... }` sub-selection is pinned at unit level.

### 5. should: the null-parent path of both relationship fields is untested (lint `link-null-untested`)
- File: `lumen-books.graphql:108-121` (`Book.author`), `174-193` (`OrderItem.book`)
- Both fields keep a `match([null, ...])` guard for a null `authorId` or `bookId`. Because D-yqmrto and D-doncxi kept them, they stay in the schema, yet no e2e case runs the guard.
- Fix: add two e2e cases:
  - A book with `"authorId": null` that selects `author`, with a mapping on `urlPath: "/authors/"`. Expect `author: null` and no error.
  - The same for an order item with `"bookId": null` selecting `book`, with a mapping on `urlPath: "/books/"`.

### 6. should: source-coverage `--check` fails on three writes (8 unresolved request rows)
- File: `lumen-books.graphql:358-364` (`query`, `genre`, `maxPriceCents`), `539-544` (`payment.type`, `last4`, `brand`, `iban`), `582-585` (`reason`)
- `source-coverage` cannot parse the `$args.x?` and `$args.payment? { ... }` body expressions, so it reports these rows as unresolved. The serialization layer proves every one of these bodies with 0 gaps (28, 16 and 3 assertions), so nothing is actually missing from the schema. However, an export gate that runs `source-coverage --check` will still fail.
- Fix:
  - Record a finding that cites the write_body_proof evidence for the three operations, so that the gap is accounted for: `graphos-factory-core findings add . --title "source-coverage request rows proven by serialization" --evidence <serialization.log> ...`.
  - Report the parser limitation (optional `?` members and argument sub-selections) as a factory issue.
  - Do not rewrite the bodies to suit the parser. The `?` forms carry out D-3avp7m (omit).

### 7. should: evidence gaps to close before publishing
- `supergraph_check` is `not_run` (exit 3, no graph ref). Run it against the target variant with `GRAPHOS_FACTORY_GRAPH_REF=<graph>@<variant>` before you publish. Compose has been proven only against this one subgraph.
- The Book `$batch` connector (lines 67-93) is proven with a single key only. The unit comment at `tests/lumen-books.connector.yaml:398-402` says rover cannot assert the comma join, and no e2e case reaches the connector. Live `books_by_ids` proves the API accepts a joined `ids` value, but not that the connector sends one.
  - Fix: add an e2e case that sends `_entities` with two Book representations. Use a WireMock mapping that matches `ids` = `b-1,b-2` and `limit` = `50`.
- Live excludes `post:/books/search`, although it is a read (D-jnm0uf). Add a live case for it if the API owner confirms the endpoint has no side effects. It is deprecated, so this is low priority.

### 8. nit: list items are nullable
- File: `lumen-books.graphql:101`, `145`, `215`, `224`
- The API never sends null items, and the live samples confirm this. Change them to `[String!]`, `[Lumen_Books_Book!]`, `[Lumen_Books_OrderItem!]` and `[Lumen_Books_Order!]`. The lists themselves can stay nullable.

### 9. nit: searchBooks arguments have no descriptions
- File: `lumen-books.graphql:349-351`
- Add descriptions to `query`, `genre` and `maxPriceCents`, as on `lumen_books_books`. The field is deprecated but still reachable.

### 10. nit: mutations take flattened arguments instead of one input
- File: `lumen-books.graphql:522-526`, `574-577`
- Consider `lumen_books_createOrder(input: Lumen_Books_NewOrderInput!)` and `lumen_books_refundOrder(orderId: ID!, input: Lumen_Books_RefundInput)`. Make this change before the first publish or not at all, because it breaks clients afterwards.

### 11. nit: cancelOrder returns Boolean but can never return false
- File: `lumen-books.graphql:612-616`
- The field returns `true` or an error. Consider returning the order id (`ID`) so that a client can evict the order from its cache.

### 12. nit: decision log hygiene (lint `decision-overlap`, 34 warnings)
- File: `.factory/decisions/` (D-88ripv, D-8b2878, D-q0zlfg, D-zkxfd4, D-doncxi and others)
- Link the overlapping decisions with `graphos-factory-core decisions link . --id <newer> --after <older>`, as the lint output suggests. This lets later reconciles tell whether two decisions disagree. In particular, D-q0zlfg should name D-doncxi, because the `Order.items` size bounds the fan-out that D-doncxi accepted.
