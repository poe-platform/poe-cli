<!-- Must keep this document up to date -->
# Roadmap

## Dev Experience

- [ ] Implement linter, prettier or something
- [ ] Warning - The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.
- [ ] command to build the extension from top level dir
- [ ] improve commit guidelines in AGENTS.md - brief simple - the usual style feat...

## CLI

- [x] Support for Roo Code docs/roo-code.md
- [x] --dry-run preview changes in the files as colorful unified diff - use `chalk`
- [x] Interactive mode should support all commands without duplication. New command added to cli mode will automatically be pulled into interactive.
    - ✅ Interactive mode reuses the CLI parser and runs `poe-setup test` for API verification.

## VSCode extension

- [x] Markdown support
    - ✅ Both assistant and user messages render through the shared markdown helper (inline code, fenced blocks).
    - ✅ Lightweight renderer, no additional build tooling required.
- [x] Create extension menu insteado of the new file like view
    - ✅ App shell renders via helpers with `poe-bw.svg` branding.
- [x] Clear is not working fix - make sure to have decent test coverage
- [x] Remove the notification after installation
- [x] It should have Settings with all configure options
    - ✅ Reads provider manifest at runtime and lists providers in a dedicated panel.
    - ✅ Provider list updates when new services are available.
- [x] Model menu is not selectable Claude-Sonnet-4.5. Clicking on it should show searchable select. 
    - ✅ Sidebar items update the model and searchable input accepts custom models.
- [x] Settings->MCPs should open MCP configuration json file
- [x] Add inline diff preview for file edits
