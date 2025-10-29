<!-- Must keep this document up to date -->
# Roadmap

## Dev Experience

- [x] Implement linter, prettier or something
    - ✅ Added ESLint + Prettier configs and npm scripts (`lint`, `format`, `format:write`).
- [x] Warning - The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
    - ✅ Migrated Vitest config in the VSCode extension to ESM (`vitest.config.mts`) eliminating the warning.
- [x] command to build the extension from top level dir
    - ✅ Added npm script `build:extension`.
- [x] improve commit guidelines in AGENTS.md - brief simple - the usual style feat...
    - ✅ Documented Conventional Commit requirements.
- [x] Extension development workflow
    - ✅ Documented repository installation + reload steps in `DEVELOPMENT.md` and `VSCODE.md`.
    - ✅ Added guidance for reloading the extension host after edits.
    - ✅ Added `npm run watch` / `npm run watch:extension` scripts for continuous builds.
    

## CLI

- [x] Support for Roo Code docs/roo-code.md
- [x] --dry-run preview changes in the files as colorful unified diff - use `chalk`
- [x] Interactive mode should support all commands without duplication. New command added to cli mode will automatically be pulled into interactive.
    - ✅ Interactive mode reuses the CLI parser and runs `poe-setup test` for API verification.
- [x] non-interactive mode, add argument like claude code or codex have where I could run agent with specific prompt
    - ✅ Added `poe-setup agent "<prompt>"` to run a single chat turn with tool call logging and credential reuse.
- [x] configure should have ability to install the app. Each service can have install section, similar to prerequisites. The install should perform check (prerequisite) and run the installation.
    - ✅ Services now expose installers triggered via `--install`, with dry-run summaries and post-install health checks.
- [ ] `login` should mention where to get teh api key https://poe.com/api_key. WHen pasting the key, it should not be shown (treat as password)

## VSCode extension

- [x] Markdown support
    - ✅ Both assistant and user messages render through the shared markdown helper (inline code, fenced blocks).
    - ✅ Lightweight renderer, no additional build tooling required.
- [x] Create extension menu insteado of the new file like view
    - ✅ Added Poe-branded activity bar icon wired to a shared sidebar webview.
    - ✅ Sidebar uses the same layout helpers as the tab view to avoid duplication.
- [x] Clear is not working fix - make sure to have decent test coverage
- [x] Remove the notification after installation
- [x] It should have Settings with all configure options
    - ✅ Reads provider manifest at runtime and lists providers in a dedicated panel.
    - ✅ Provider list updates when new services are available.
- [x] Model menu is not selectable Claude-Sonnet-4.5. Clicking on it should show searchable select. 
    - ✅ Sidebar items update the model and searchable input accepts custom models.
- [x] Settings->MCPs should open MCP configuration json file
- [x] Add inline diff preview for file edits
- [x] The app is somehow broken at the moment, doesn't send messages.
    - ✅ Refactored webview bridge around a tested controller and mockable chat service.
    - ✅ Added fast Vitest coverage for controller/runtime flows to guard regressions.
    - ✅ Broadcast tool/diff events across panel + sidebar to keep UX consistent.
- [x] All files must have unit tests
    - ✅ Added Vitest suites for commands, config, state, and each webview helper.
- [x] Remove the keyboard shortcut - it's too aggressive
    - ✅ Dropped default keybinding from `package.json`; commands stay accessible via palette.
- [x] Can you implement some e2e tests? THere's a way to download the vscode and run tests for real. Could you try that out? I want to initially just open the extension and see if there are no errors
    - ✅ Vitest e2e harness compiles the extension, launches VSCode via `@vscode/test-electron`, activates the extension, and skips gracefully if downloads are unreachable.


## WIP (do not implement)  Extension redesign

- [ ] Single pane layout, only the chat interface
- [ ] Dedicated chat history page
- [ ] Top right menu items (from right)
    - New message
    - Settings
    - Chat history
- [ ] Smaller font

## Github Worflows
- [x] Issue resolution agent
    - ✅ Added `.github/workflows/issue-resolution-agent.yml` to configure agent tooling from labels, execute fixes, and raise pull requests automatically.
- [x] Pull request reviewer
    - ✅ Added `.github/workflows/pull-request-reviewer.yml` to schedule cross-provider reviews and publish automated review feedback on pull requests.

## WIP (do not implement) Poe Agent
- [ ] Ability to spawn any supported sub-agents (add specialized tool for this)
- [ ] configure utility should store in the own json config file also which agents are config and offer those dynamically in the tool description

## Code quality

- [ ] make sure that `credentialsPath` `.poe-setup/credentials.json` is defined in 1 single place, so it can be changed easily
