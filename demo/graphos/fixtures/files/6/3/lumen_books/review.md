VERDICT: CHANGES

Schema review of `lumen-books.graphql` at commit 5cc3ca6 (evidence run 2026-10-21T18-50-32-418Z, commit b9aea9e).
The evidence input hashes for the schema, `openapi.json` and `selection.yaml` match the files on disk, so the evidence is current.

Summary: 1 blocker, 6 should-fix, 4 nits.

What is right: the prefixes follow `naming.md` (`Lumen_Books_*`, `lumen_books_<camelCase>`, enums in wire casing per F-jx72bt). Every resolved decision is carried out: metadata omitted (D-2hoz50, D-crbiq7), email and phone omitted (D-4yyj7v, D-xwq2hy), apiKey omitted (D-wf0vvx, D-nmhlzf), iban exposed as the user chose (D-a39c6a), Book and Author are the only entities (D-qbc6qk), Order.customer is not linked (D-ox8zkp), and searchBooks is under Query (D-jnm0uf). Both `@key(fields: "id")` fields are in their connectors' selections. There is no `@shareable`, which is right because no other subgraph returns these types. Output fields are nullable, which matches the factory's conservative nullability rule. Path arguments are `!`. The `@source` errors block surfaces `message`, `code` and `httpStatus`, and e2e executes every documented 401, 404 and 422.

## Findings

### 1. blocker: OrderItem.book bypasses the batched Book entity and fans out once per order item
- File: `lumen-books.graphql:166-187`
- `Lumen_Books_OrderItem.book` is a field-level connector on `GET /books/{$this.bookId}`. It sends one request for each order item. `lumen_books_orders(limit: 50)` returns up to 50 orders, and the spec does not bound the number of items in an order, so a single query can send an unbounded number of requests. D-wnrxww chose batching specifically so that "OrderItem.book and cross-subgraph references then cost one request per page, not per item". The `$batch` connector on `Lumen_Books_Book` (lines 66-91) exists, but this field never uses it.
- Fix: remove the field-level `@connect` from `OrderItem.book`. In the five connectors that return orders (`lumen_books_orders`, `lumen_books_order`, `lumen_books_createOrder`, `lumen_books_updateOrder`, and the items block of each), map an entity reference in the items selection: `items { bookId quantity unitPriceCents book: { id: bookId } }`. The router then resolves `book` through the type-level `$batch` connector, which takes at most 50 ids per request. Keep `book` nullable. Then re-run reconcile, lint and e2e (`order_items_book` should then hit `GET /books?ids=b-1301&limit=50`), and add an e2e case where an order holds two or more items.

### 2. should: Book.author duplicates the Author entity connector (lint `link-key-drift`)
- File: `lumen-books.graphql:101-117`
- `Book.author` uses its own field-level `GET /authors/{$this.authorId}` with a selection copied from `Lumen_Books_Author` (lines 121-137). Lint warns that the two copies can drift apart.
- Fix: map `author: { id: authorId }` in every Book selection: the `$batch` connector, `lumen_books_books`, `lumen_books_book`, `lumen_books_searchBooks`, and `OrderItem.book` once finding 1 is applied. Delete the field-level connector. The request count stays the same (Author has no batch endpoint), but the field then follows the single Author connector.

### 3. should: No demand-control sizes on the lists
- File: `lumen-books.graphql:10`, `141`, `209`, `260-271`, `331-335`, `407-416`
- `@listSize` is not imported or used. `BookPage.data` and `OrderPage.data` hold up to 50 items. `Order.items` has no bound. `lumen_books_searchBooks` has no limit argument at all, so its page size is whatever the API chooses.
- Fix: add `@listSize` to the federation `@link` import. Then add `@listSize(slicingArguments: ["limit"], sizedFields: ["data"], requireOneSlicingArgument: false)` on `lumen_books_books` and `lumen_books_orders`. Add `@listSize(assumedSize: 50)` on `lumen_books_searchBooks`, or a value from the API owner, and `@listSize(assumedSize: <documented or observed max>)` on `Lumen_Books_Order.items`.

### 4. should: Paging arguments do not carry the source defaults
- File: `lumen-books.graphql:264`, `266`, `415`
- The spec sets defaults for `page` (1) and `limit` (10 on both `/books` and `/orders`). The schema states them only in descriptions, so introspection and demand control cannot see them.
- Fix: declare `page: Int = 1` and `limit: Int = 10` on `lumen_books_books`, and `limit: Int = 10` on `lumen_books_orders`. The values sent to the API do not change.

### 5. should: Shared service credential exposes orders, payment details and customers to every graph client
- File: `lumen-books.graphql:18`, `template.yaml` (AUTH_EXPR test default `{$env.LUMEN_BOOKS_TOKEN}`), and fields at `194-202`, `386`, `407`, `456`, `484`
- Every request carries one bearer token. Any supergraph client can therefore read any customer's orders (`lumen_books_orders(customerId:)`), full IBANs (exposed per D-a39c6a), customer names, and integration webhook URLs. They can also create, update and cancel orders. D-wf0vvx also noted that `webhookUrl` may embed a token (line 229), and nobody answered that question.
- Fix: choose one and record it as a decision. (a) Set AUTH_EXPR to forward the caller's token (`{$request.headers.authorization}`, with the `Bearer ` prefix handled), so the API enforces per-user access. (b) Keep the service token and add `@authenticated` or `@requiresScopes` to the order, customer and integration fields and to the three mutations. Separately, ask the user whether `webhookUrl` should be omitted.

### 6. should: Evidence gaps to close before export
- `live`: `not_run` (no `tests/live.yaml`). Every fixture is hand-written from the spec (memory.md). In particular, D-x1ekw6 says the API's behaviour with `ids` and `limit` together "is not verified live". Record live traffic for at least `get:/books?ids=...&limit=50` and one order read.
- `supergraph_check`: `not_run` (no graph ref). Run it against the target variant before publishing.
- `conformance`: 60 bodies conform, 1 `unchecked`. Identify that body and either check it or record why it cannot be checked.
- Lint `missing-unit`: `lumen_books_createOrder` (line 502) and `lumen_books_cancelOrder` (line 594) have no `rover connector test` entry. Add them to `tests/lumen-books.connector.yaml`.
- Lint `link-null-untested` (lines 104 and 169): no e2e case covers a parent whose `authorId` or `bookId` is null. Finding 1 or 2 removes these guards. If either field-level connector stays, add the null-parent case.
- The Book `$batch` unit test uses one key (memory.md), and no e2e case reaches the entity connector with several ids. Applying finding 1 lets e2e cover this.

### 7. should: Payment input does not say which members each type requires
- File: `lumen-books.graphql:239-248`
- In the spec, `CardPayment` requires `last4` and `BankPayment` requires `iban`. The input accepts `{type: card}` with no `last4`, and the caller only finds out from a 422.
- Fix: describe each field: "Required when type is card." on `last4`, and "Required when type is bank." on `iban`. A `@oneOf` input split into `card` and `bank` is the stronger option, but it would reopen D-xghnp0.

### 8. nit: Mutations take flattened arguments instead of one input
- File: `lumen-books.graphql:502-506`, `553-558`
- The request bodies are the `$ref` components `NewOrder` and `OrderUpdate`. `naming.md` keeps component names, and the graphql-schema guide prefers a single `input:` argument. Consider `lumen_books_createOrder(input: Lumen_Books_NewOrderInput!)` and `lumen_books_updateOrder(orderId: ID!, input: Lumen_Books_OrderUpdateInput!)`. Do this only now, before any client depends on the current shape.

### 9. nit: List items are nullable
- File: `lumen-books.graphql:98`, `141`, `209`, `217`
- `[String]` and `[Lumen_Books_Book]` permit null items, but the API never sends them. This is consistent with the conservative nullability rule. Once live samples exist, tighten the items to `[T!]` (the list itself can stay nullable).

### 10. nit: Date and date-time values are plain String
- File: `lumen-books.graphql:99`, `158`, `212`
- `publishedAt` is `format: date`, and `createdAt` is `format: date-time`. Mention the format in the field descriptions, for example "ISO 8601 date (YYYY-MM-DD)", so callers know what to parse.

### 11. nit: cancelOrder's return value cannot be false
- File: `lumen-books.graphql:594-599`
- The field returns `true` or an error, never `false`. The description already says so. Consider returning the order id (`ID`) instead, so a client can evict it from its cache.
