# Principles

- TDD is a MUST
- SOLID
- YAGNI, KISS
- Never copy/paste more than 5 lines of code

# Testing file changes

- Tests can't create files - use `memfs` library to test changes in memory
- Tests can't query LLM - implement abstraction to mock this reliably across all files

# Commits

- Commit every atomic change, once the tests are green.
- Follow Conventional Commits (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`).
- Keep subjects imperative and under 72 characters.
- If the workspace is dirty, commit the old changes first so you can start clean

# Configure commands

Regexes are not allowed. When modifying existing files, you must parse them and deep merge them. If you run into unsupported file e.g. yaml, install parser library. 
