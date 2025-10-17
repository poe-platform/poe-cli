# Development

This guide covers local setup and day-to-day workflows for contributors. All
changes should follow TDD, SOLID, YAGNI, and KISS as outlined in `AGENTS.md`.

## Local Setup

```bash
git clone <your-fork-url>
cd poe-setup-scripts
npm install
npm run build
npm link    # optional: exposes `poe-setup` from the local dist build
```

- Use `npm run build` before `npm link` so the CLI points at the compiled
  output.
- During rapid iteration you can skip the global install and run commands via
  `npm run dev -- <command>`.

## Development Workflow

```bash
npm install         # install dependencies
npm run dev         # run the CLI via tsx
npm run build       # compile TypeScript and copy templates into dist
npm test            # execute the Vitest suite (required before committing)
```

- Run `npm run dev -- <command>` to invoke the CLI without rebuilding:

  ```bash
  npm run dev -- configure claude-code --api-key YOUR_KEY
  npm run dev -- test
  ```

- Keep documentation in sync with behaviour changes (README, command help, and
  templates).
- Builds output to `dist/`; the published package exposes `dist/index.js` as the
  `poe-setup` binary.

## Testing

- `npm test` runs `vitest run`; append `-- --watch` during TDD.
- Filesystem interactions exercise `memfs` via the `FileSystem` abstraction in
  `src/utils/file-system.ts`. Tests must never touch the real disk.
- Add focused unit tests alongside each command/service before implementing new
  behaviour.

Example setup:

```typescript
import { Volume, createFsFromVolume } from "memfs";
import type { FileSystem } from "../src/utils/file-system.js";

const volume = Volume.fromJSON({});
const fs = createFsFromVolume(volume).promises as unknown as FileSystem;
```

## Project Structure

- `src/index.ts` – CLI entrypoint wiring `commander`, prompts, and dependencies.
- `src/cli/program.ts` – command registration and shared wiring (dry-run orchestration).
- `src/commands/` – feature-specific implementations (init, configure, query, etc.).
- `src/services/` – service adapters (Claude Code, Codex) including backup logic.
- `src/utils/` – shared helpers for backups, dry runs, templates, and filesystem abstractions.
- `tests/` – Vitest suites mirroring the command/service structure.

## Roadmap

- [x] Replace backup-based removal with pure pattern matching for Claude Code and Codex.
- [x] Introduce login/logout commands to securely store the Poe API key.
- [x] Add a `test` command that pings the Poe EchoBot to validate credentials end-to-end.
- [x] claude code should create/edit config json; see `docs/claude-code.md`.
- [x] Add command `query <model> <text>` that queries the OpenAI-compatible API and echoes the response.
- [x] Default `query` to Claude-Sonnet-4.5 with `--model` overrides.
