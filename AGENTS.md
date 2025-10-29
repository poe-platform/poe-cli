# Principles

- TDD is a MUST
- SOLID
- YAGNI, KISS

# Testing file changes

- Tests can't create files - use `memfs` library to test changes in memory
- Tests can't query LLM - implement abstraction to mock this reliably across all files

# Commits

Commit every atomic change, once the tests are green

# Configure commands

Regexes are not allowed. When modifying existing files, you must parse them and deep merge them. If you run into unsupported file e.g. yaml, install parser library. 