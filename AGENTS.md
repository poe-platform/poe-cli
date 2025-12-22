# Instructions

## Core Principles

- TDD is a MUST (only for code changes, not for configs)
- SOLID
- YAGNI, KISS
- Never copy/paste more than 5 lines of code
- Never revert code/docs that you didn't create

## Bad habits that I want to avoid

- Functions that do nothing just proxy to another functions are not allowed
- Do not overuse constants, only for "business logic" not for things like concatenate two constants
- The tests should not be causing complexity.

## github workflows

Do not write unit tests
Use `npm run lint:workflows`

## Testing file changes

- Tests can't create files - use `memfs` library to test changes in memory
- Tests can't query LLM - implement abstraction to mock this reliably across all files

## Commits

- Commit every atomic change, once the tests are green.
- Follow Conventional Commits (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`).
- Keep subjects imperative and under 72 characters.
- If the workspace is dirty, commit the old changes first so you can start clean
- Commit specific files that you edited, never blanket git add -A

## Configure commands / Providers

Regexes are not allowed. When modifying existing files, you must parse them and deep merge them. If you run into unsupported file e.g. yaml, install parser library.

The Providers should have as little as possible boilerplate, keep them simple. They should not know anything about logging, dry run.

## Readme

You are not allowed to add anything to readme without user's permission. Upon feature completion, ask user whether readme should be updated.
