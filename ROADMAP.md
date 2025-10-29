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
- [ ] Extension development workflow
    - Document how install the extension from the directory 
    - Document how to restart extensions when files change
    - Add watch command - from both parent and extension directory
    

## CLI

- [x] Support for Roo Code docs/roo-code.md
- [x] --dry-run preview changes in the files as colorful unified diff - use `chalk`
- [x] Interactive mode should support all commands without duplication. New command added to cli mode will automatically be pulled into interactive.
    - ✅ Interactive mode reuses the CLI parser and runs `poe-setup test` for API verification.

- [ ] non-interactive mode, add argument like claude code or codex have where I could run agent with specific prompt
- [ ] configure should have ability to install the app. Each service can have install section, similar to prerequisites. The install should perform check (prerequisite) and run the installation.

## VSCode extension

- [x] Markdown support
    - ✅ Both assistant and user messages render through the shared markdown helper (inline code, fenced blocks).
    - ✅ Lightweight renderer, no additional build tooling required.
- [ ] Create extension menu insteado of the new file like view
    - App shell renders via helpers with `poe-bw.svg` branding.
    - This should be the left side toolbar - svg icon and it should show the Poe 
- [x] Clear is not working fix - make sure to have decent test coverage
- [x] Remove the notification after installation
- [x] It should have Settings with all configure options
    - ✅ Reads provider manifest at runtime and lists providers in a dedicated panel.
    - ✅ Provider list updates when new services are available.
- [x] Model menu is not selectable Claude-Sonnet-4.5. Clicking on it should show searchable select. 
    - ✅ Sidebar items update the model and searchable input accepts custom models.
- [x] Settings->MCPs should open MCP configuration json file
- [x] Add inline diff preview for file edits
- [ ] The app is somehow broken at the moment, doesn't send messages.
    - Devise a plan to add integration tests with mock LLM
    - It should be really hard to cause regression
    - The tests should be very fast
    - Maybe refactor to use React if it makes things easier
    - Make sure that all features work flawlessly
- [ ] All files must have unit tests
- [ ] Remove the keyboard shortcut - it's too aggressive


## Github Worflows
- [ ] Issue resolution agent
    - When new issue is created and owner/maintainer tags it with tag - claude-code, open-code, ... (all providers in the app)
    - It should spawn coding agent
    - It must setup the provider using this library first
    - Then it should run it to attempt to resolve the issue and create a pull request
WIP (do not implement) - [ ] Pull request reviewer
    - The different coding agents need to cross check pull requests.
    - Any Open PR should be reviewed by random other coding agent, other than the author.
    - Any comments should be picked up by original coding agent