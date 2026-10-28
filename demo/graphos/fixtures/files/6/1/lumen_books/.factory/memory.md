# lumen_books memory

- No live API was probed. Every fixture is hand-audited from the spec; the
  `tests/live.yaml` layer does not exist yet.
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

## Tried and rejected

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
