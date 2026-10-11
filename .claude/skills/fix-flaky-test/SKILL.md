---
name: fix-flaky-test
description: Diagnose and fix a flaky test by finding the cause rather than retrying or loosening it. Use when a test passes and fails without code changes.
---

# Fix a flaky test

1. **Reproduce.** Run the test 20 times in a loop. Note the failure rate and the
   exact assertion. If you cannot make it fail, say so and stop: do not guess.
2. **Classify the cause**: shared state or ordering between tests; time or timezone;
   randomness; real network or filesystem; concurrency or missing await; resource
   limits. Find evidence for the class (run alone vs in the suite, fixed clock,
   fixed seed).
3. **Fix the cause**: isolate state, inject a clock or seed, fake the network,
   await the right thing. 
4. **Never** fix it by adding sleeps, retries, a looser assertion, or skipping the
   test. If the test is wrong, say why and rewrite what it asserts.
5. **Prove it.** The same 20 runs, then the full suite once. Put the before and
   after failure rate in `build.md`.
