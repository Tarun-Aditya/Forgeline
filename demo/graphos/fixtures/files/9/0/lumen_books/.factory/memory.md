# lumen_books memory

- Live API probed 2026-10-22 (record): 15 scrubbed samples for the 7 GETs under
  `.factory/samples/`. Existing fixtures under tests/fixtures are still the
  hand-audited ones; no `.factory/recordings.yaml` exists, so `fixtures` derived
  nothing and overwrote nothing. `tests/live.yaml` cases were added after the first apply.
- The API at http://127.0.0.1:4010 answers with `Server: LumenBooks/1
  Python/3.9.6` and a 401 `unauthorized` body without the token: it is not a
  Prism mock (Prism is Node), but whether it is the production service or a
  local stand-in is not established.
- `APOLLO_ELV2_LICENSE=accept` was already set in the environment the first
  apply ran in; the consent was not given in this session.
- Book.authorId and OrderItem.bookId are `required` in the spec, so a stub
  with a null or missing fk fails conformance. The relationship fields keep
  `links apply`'s null guards (the fields are nullable: no sample has shown
  them populated), but no null-parent e2e case exists; lint warns
  `link-null-untested` on both.
- rover's unit URI assertion cannot compare a comma-joined `$batch` list (it
  percent-encodes the expected comma, not the sent one), so the Book `$batch`
  unit entry uses one key.
- Live difference: GET /orders returns o4 (cancelled) with `payment: null`; the
  spec's Payment is not nullable. Spec documents 401 on /books and /orders; not
  probed. Everything else recorded matched the spec (no undocumented fields, no
  null required field). `infer --update-inventory` rewrote 8 shapes in
  inventory.json and sources.lock.yaml: `lock --check` will name that edit.

## Tried and rejected

- A unit entry for lumen_books_createOrder: `items` is a list of input
  objects and `payment` an input object, and rover rejects list- and
  map-valued `$args` at parse time, so the body is proven at e2e and the
  write-body proof only. Lint's `missing-unit` on post:/orders stays.
- SDL defaults on paging arguments (`page: Int = 1`, `limit: Int = 10`, review
  2026-10-22 item 4): rejected by the skill's "never an executable SDL
  default" policy; the provider defaults stay in the doc comments.
- Order.payment as a union on a field-level re-fetch connector (GET
  /orders/{$this.id}): composes, but reconcile reads it as an undeclared
  relationship field and coverage leaves payment unmapped on all four Order
  operations. Replaced by one typed object (D-rvl036).
- Making Author an entity through `@connect(entity: true)` on the Query
  field: reconcile looks for a type-level `@connect`, so Author uses one.
- `$args.x?` (null-dropping) body members read `unresolved` in
  source-coverage whatever the spelling (`$args?.x`, `$($args.x?)`,
  `?? null`); a `?` on a key inside an argument sub-selection
  (`unitPriceCents?`) is read as mapped (F-p8a153).
- `read-root-on-write` keeps warning on post:/books/search although D-jnm0uf
  records the query choice; the rule did not clear with an extra decision
  naming the operation either.
