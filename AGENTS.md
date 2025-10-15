# Principles

- TDD is a MUST
- SOLID
- YAGNI, KISS

# Testing file changes

- Tests can't create files - use `memfs` library to test changes in memory

# Commits

Commit every atomic change, once the tests are green