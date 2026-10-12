# Performance checklist

Measure before you flag. A finding names the code, the cost and how it grows.

- No query or network call inside a loop; batch or join it.
- New queries on a large table have a usable index; lists are paginated or bounded.
- Work that need not block the caller (email, export, resize) is not on the request path.
- No unbounded growth: caches, queues, in-memory lists and logs have a limit.
- Large payloads are streamed or paged, not read whole into memory.
- Frontend: no new heavy dependency for a small job; images sized and lazy; no layout shift from late content.
- Repeated pure work is computed once; expensive work is not repeated on every render or call.
- A performance claim in the spec or build log has a measurement behind it.
