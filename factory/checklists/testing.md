# Testing checklist

- A new behaviour has a test that fails without the change and passes with it.
- Tests assert behaviour a caller can see, not which private functions were called.
- Error paths and boundaries (empty, zero, max, invalid) are covered, not only the happy path.
- A test would fail if the function under test returned nothing; no test passes by asserting a mock.
- Tests are deterministic: no wall-clock, randomness, network or order dependence.
- A bug fix has a regression test that reproduces the bug first.
- No test is skipped, focused, loosened or deleted to reach green.
- A test fixture does not duplicate production logic it is meant to check.
