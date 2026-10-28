VERDICT: CHANGES

Schema review of `lumen-books.graphql` at commit 2af7cd1 (evidence run 2026-10-21T18-55-43-796Z, recorded against `ac392fe-dirty`).
The evidence input hashes for all 141 files (schema, `openapi.json`, `selection.yaml`, decisions, tests) match the files on disk, so the evidence is current.
`lumen-books.graphql`, `selection.yaml`, `openapi.json` and `template.yaml` have not changed since the previous review (ac392fe). The only new evidence is the live layer, which passes 7 cases and excludes 4 writes. So findings 1-5 and 7-11 of the previous review still stand at the same lines. Finding 6 is updated below.

Summary: 1 blocker, 6 should-fix, 4 nits.

What is right: the prefixes follow `naming.md` (`Lumen_Books_*`, `lumen_books_<camelCase>`, enums in wire casing per F-jx72bt). Every resolved decision is carried out:
- `metadata` is omitted (D-2hoz50, D-crbiq7).
- `email` and `phone` are omitted (D-4yyj7v, D-xwq2hy).
- `apiKey` is omitted (D-wf0vvx, D-nmhlzf).
- `iban` is exposed, as the user chose (D-a39c6a).
- Book and Author are the only entities (D-qbc6qk).
- `Order.customer` is not linked (D-ox8zkp).
- `searchBooks` sits under Query (D-jnm0uf).

Both `@key(fields: "id")` fields are in their connectors' selections. There is no `@shareable`, which is right. Output fields are nullable, which matches the factory's conservative nullability rule. Path arguments are `!`. The `@source` errors block surfaces `message`, `code` and `httpStatus`. e2e executes every documented 401, 404 and 422 (32/32 pass), and unit runs 62/62. Compose passes on federation 2.15.2.

## Findings

### 1. blocker: OrderItem.book bypasses the batched Book entity and fans out once per order item
- File: `lumen-books.graphql:166-187`
- `Lumen_Books_OrderItem.book` is a field-level connector on `GET /books/{$this.bookId}`, so it sends one request per order item. `lumen_books_orders(limit: 50)` returns up to 50 orders, and the spec does not bound `Order.items`. One query can therefore send an unbounded number of requests. D-wnrxww chose batching so that "OrderItem.book and cross-subgraph references then cost one request per page, not per item". The `$batch` connector on `Lumen_Books_Book` (lines 66-91) exists, but this field never uses it. The new live case `list_orders` selects `items { book { id title } }` and passes, which confirms the field works, but it works through this per-item path.
- Fix: remove the field-level `@connect` from `OrderItem.book`. In the items selection of the four connectors that return orders (`lumen_books_orders`, `lumen_books_order`, `lumen_books_createOrder`, `lumen_books_updateOrder`), map an entity reference: `items { bookId quantity unitPriceCents book: { id: bookId } }`. The router then resolves `book` through the type-level `$batch` connector, which takes at most 50 ids per request. Keep `book` nullable. Then re-run reconcile, lint, e2e and live:
  - e2e `order_items_book` should then hit `GET /books?ids=b-1301&limit=50`.
  - Add an e2e case where an order holds two or more items.

### 2. should: Book.author duplicates the Author entity connector (lint `link-key-drift`)
- File: `lumen-books.graphql:101-117`
- `Book.author` has its own field-level `GET /authors/{$this.authorId}`, and its selection is copied from `Lumen_Books_Author` (lines 121-137). Lint still warns that the two copies can drift apart.
- Fix: map `author: { id: authorId }` in every Book selection: the `$batch` connector, `lumen_books_books`, `lumen_books_book`, `lumen_books_searchBooks`, and `OrderItem.book` once finding 1 is applied. Delete the field-level connector. The request count stays the same, because Author has no batch endpoint, but the field then goes through the single Author connector.

### 3. should: No demand-control sizes on the lists
- File: `lumen-books.graphql:10`, `141`, `209`, `260-271`, `331-335`, `407-416`
- `@listSize` is neither imported nor used. `BookPage.data` and `OrderPage.data` hold up to 50 items each. `Order.items` has no bound. `lumen_books_searchBooks` has no limit argument, so its page size is whatever the API chooses.
- Fix: add `@listSize` to the federation `@link` import, then:
  - On `lumen_books_books` and `lumen_books_orders`, add `@listSize(slicingArguments: ["limit"], sizedFields: ["data"], requireOneSlicingArgument: false)`.
  - On `lumen_books_searchBooks`, add `@listSize(assumedSize: 50)`, or a value from the API owner.
  - On `Lumen_Books_Order.items`, add `@listSize(assumedSize: <documented or observed max>)`.

### 4. should: Paging arguments do not carry the source defaults
- File: `lumen-books.graphql:264`, `266`, `415`
- The spec sets defaults for `page` (1) and for `limit` (10 on both `/books` and `/orders`). The schema gives them only in descriptions, so neither introspection nor demand control can see them.
- Fix: declare `page: Int = 1` and `limit: Int = 10` on `lumen_books_books`, and `limit: Int = 10` on `lumen_books_orders`. The values sent to the API do not change.

### 5. should: Shared service credential exposes orders, payment details and customers to every graph client
- File: `lumen-books.graphql:18`, `template.yaml:6-8` (AUTH_EXPR test default `{$env.LUMEN_BOOKS_TOKEN}`), and fields at `194-202`, `386`, `407`, `456`, `484`
- Every request carries one service bearer token. As a result, any supergraph client can:
  - read any customer's orders through `lumen_books_orders(customerId:)`,
  - read full IBANs (exposed per D-a39c6a), customer names, and integration webhook URLs,
  - create, update and cancel orders.

  D-wf0vvx also noted that `webhookUrl` (line 229) may embed a token, and that question is still open.
- Fix: choose one option and record it as a decision.
  - (a) Set AUTH_EXPR to forward the caller's token (`{$request.headers.authorization}`, with the `Bearer ` prefix handled), so the API enforces per-user access.
  - (b) Keep the service token, and add `@authenticated` or `@requiresScopes` to the order, customer and integration fields and to the three mutations.

  Separately, ask the user whether `webhookUrl` should be omitted.

### 6. should: Evidence gaps to close before export (updated)
- `live` now passes 7 read cases and excludes the 4 writes, but:
  - It runs against `http://127.0.0.1:4010`, the only server in `openapi.json`. That is also Prism's default mock port. If it is a mock built from the spec, the live layer proves no more than conformance does. Confirm that it is the real API, or point BASE_URL at one.
  - No live case reaches the Book `$batch` entity connector. D-x1ekw6's open point (how the API behaves with `ids` and `limit` together) is therefore still unverified. After finding 1, `list_orders` (`tests/live/list_orders.graphql`) will exercise it. Until then, add a live `lumen_books_books(ids: "<id1>,<id2>", limit: 50)` case.
  - `post:/books/search` is excluded as a write, but it is a read (D-jnm0uf). Consider a live case for it if the API owner confirms it has no side effects.
- `supergraph_check`: `not_run`. The layer is absent from `latest.json` because no graph ref is set. Run it against the target variant before publishing.
- `conformance`: 60 bodies conform, and 1 is `unchecked`: `tests/fixtures/mappings/cancel_order.json`, which is a 204 with no body. That is expected. Record it as accepted so the count reads clean.
- Lint `missing-unit`: `lumen_books_createOrder` (line 502) and `lumen_books_cancelOrder` (line 594) have no `rover connector test` entry. Add both to `tests/lumen-books.connector.yaml`.
- Lint `link-null-untested` (lines 104 and 169): findings 1 and 2 remove these guards. If either field-level connector stays, add the null-parent e2e case.
- Lint `read-root-on-write` for `post:/books/search` still warns, although D-jnm0uf records the choice (memory.md). This is a factory rule issue, not a schema issue. Note it in the export so nobody re-litigates it.

### 7. should: Payment input does not say which members each type requires
- File: `lumen-books.graphql:239-248`
- In the spec, `CardPayment` requires `last4` and `BankPayment` requires `iban`. The input accepts `{type: card}` with no `last4`, and the caller only finds out from a 422.
- Fix: describe the fields: "Required when type is card." on `last4`, and "Required when type is bank." on `iban`. A `@oneOf` input split into `card` and `bank` is the stronger option, but it would reopen D-xghnp0.

### 8. nit: Mutations take flattened arguments instead of one input
- File: `lumen-books.graphql:502-506`, `553-558`
- The request bodies are the `$ref` components `NewOrder` and `OrderUpdate`. Consider `lumen_books_createOrder(input: Lumen_Books_NewOrderInput!)` and `lumen_books_updateOrder(orderId: ID!, input: Lumen_Books_OrderUpdateInput!)`. Make this change now or not at all: once clients depend on the current shape, it is a breaking change.

### 9. nit: List items are nullable
- File: `lumen-books.graphql:98`, `141`, `209`, `217`
- `[String]` and `[Lumen_Books_Book]` permit null items, but the API never sends them. The live samples now show the lists populated with non-null items. Tighten the items to `[T!]`; the list itself can stay nullable.

### 10. nit: Date and date-time values are plain String
- File: `lumen-books.graphql:99`, `158`, `212`
- `publishedAt` is `format: date` and `createdAt` is `format: date-time`. Mention the format in the field descriptions, for example "ISO 8601 date (YYYY-MM-DD)".

### 11. nit: cancelOrder's return value cannot be false
- File: `lumen-books.graphql:594-599`
- The field returns `true` or an error, never `false`. Consider returning the order id (`ID`) so a client can evict the order from its cache.
