# Development

This guide covers local setup and day-to-day workflows for contributors. All
changes should follow TDD, SOLID, YAGNI, and KISS as outlined in `AGENTS.md`.

## Local Setup

```bash
git clone <your-fork-url>
cd poe-code
npm install
npm run build
npm link    # optional: exposes `poe-code` from the local dist build
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
  `poe-code` binary.

## VS Code Extension Workflow

Use these commands when working on the bundled VS Code extension:

```bash
npm run build:extension     # one-off TypeScript compile into vscode-extension/out
npm run watch:extension     # keep the extension build up-to-date while editing
```

- Within `vscode-extension/` you can run `npm install` and `npm run watch` for a
  standalone workflow.
- Install the extension build in VS Code without packaging by running:

  ```bash
  code --extensionDevelopmentPath=vscode-extension
  ```

  or via the command palette: `Developer: Install Extension from Location...`
  and choose the `vscode-extension` directory.
- After code changes, use `Developer: Reload Window` (or `Developer: Restart
  Extension Host`) to pick up the latest build.

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
