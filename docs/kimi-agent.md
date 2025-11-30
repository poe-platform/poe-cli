# Kimi Agent Provider – Spec

## Background

Kimi CLI (by Moonshot AI) is a shell-oriented coding agent with ACP/MCP integration. Poe already hosts
several Kimi K2 variants. Issue #23 tracks wiring the CLI so it can use Poe as its backend via `poe-code`.

## Goals

- Expose a `kimi` provider discoverable via `poe-code install|configure|spawn|test|remove`.
- Reuse the Poe API key and model prompts consistent with existing providers.
- Keep provider logic isolated (no command-specific branching outside `src/providers/kimi.ts`).
- Document the generated config/auth files so users understand what the CLI consumes.

## Non-Goals

- Modifying the README (per repo policy) or shipping new CLIs besides Kimi.
- Adding general-purpose MCP management; we only emit the files Kimi requires.
- Managing PyPI/uv installations beyond invoking documented commands.

## User Flow

| Step | Behaviour |
| --- | --- |
| `install` | Detects `kimi` binary; if missing, runs `uv tool install --python 3.13 kimi-cli` and re-checks `kimi --version`. |
| `configure` | Prompts for Poe API key + default Kimi model, ensures config/auth directories, merges JSON configs, and registers metadata. |
| `test` | Runs `kimi --mcp-config-file ~/.config/kimi/poe-code-mcp.json exec "Output exactly: KIMI_OK"` expecting `KIMI_OK`. |
| `spawn` | Uses the MCP file written above, forwards `--model` override and extra CLI args, and streams stdout/stderr. |
| `remove` | Prunes provider-owned sections from JSON files and deletes the generated MCP file when empty. |

## Implementation Outline

1. **Constants**
   - Add `KIMI_MODELS` and `DEFAULT_KIMI_MODEL` to `src/cli/constants.ts` with entries such as `"Kimi-K2"` and
     `"Kimi-K2-Thinking"`.

2. **Templates + Manifest**
   - Create `src/templates/kimi/config.json.hbs`, `auth.json.hbs`, and `poe-code-mcp.json.hbs`.
   - `configure` mutations:
     1. `ensureDirectory("~/.config/kimi")` and `ensureDirectory("~/.local/share/kimi")`.
     2. `jsonMergeMutation` for `~/.config/kimi/config.json` merging:
        ```json
        {
          "$schema": "https://kimi.com/config.schema.json",
          "defaultModel": "{{model}}",
          "providers": {
            "poe": {
              "name": "Poe API",
              "baseURL": "https://api.poe.com/v1",
              "env": {
                "POE_API_KEY": "{{apiKey}}"
              }
            }
          },
          "mcpConfig": "{{env.resolveHomePath(".config", "kimi", "poe-code-mcp.json")}}"
        }
        ```
     3. `jsonMergeMutation` for `~/.local/share/kimi/auth.json` storing `{ "poe": { "type": "api", "key": "{{apiKey}}" } }`.
     4. `writeTemplateMutation` for the MCP config describing user MPC servers (initially empty object).
   - `remove` uses `jsonPruneMutation` to delete the `poe` entries and `removeFileMutation` for `poe-code-mcp.json`.

3. **Provider Definition (`src/providers/kimi.ts`)**
   - `label: "Kimi CLI"`, branding colors from marketing assets.
   - `configurePrompts.model` derived from `KIMI_MODELS`.
   - `install`: `createBinaryExistsCheck("kimi", ...)` plus `uv tool install --python 3.13 kimi-cli` step and
     `kimi --version` post-check via `createCommandExpectationCheck`.
   - `test`: expectation check described in the flow.
   - `spawn`: Build args `["--mcp-config-file", configPath, "exec", prompt, ...]` and insert `--model <override>` when provided.
   - `versionResolver`: use `createBinaryVersionResolver("kimi")` so configured metadata records CLI versions.

4. **CLI Wiring**
   - Export service from `src/providers/index.ts` and append to `getDefaultProviders()`.
   - Update command descriptions (install/configure/test/remove/spawn) to include `kimi`.
   - Regenerate provider menu order so the service appears in interactive list.
   - Update label generator to emit `agent:kimi`.

5. **Tests**
   - Create `tests/kimi.test.ts` mirroring `opencode.test.ts`
     - configure writes config/auth/MCP files
     - remove prunes entries
     - spawn/test behaviours
   - Extend command-level tests (`configure`, `remove`, `spawn`) to cover the new provider.
   - Adhere to memfs rules (no real filesystem IO).

6. **Docs**
   - Capture generated file examples in `docs/kimi.md` similar to `docs/opencode.md`.
   - Keep README untouched until the user explicitly approves changes.

## Validation

- `npm test` for all suites.
- `npm run labels:generate` after merging to keep `docs/LABELS.md` up to date (separate PR if desired).

## Risks / Follow-ups

- If the CLI requires login beyond API key injection we may need to capture extra files.
- Confirm whether `kimi exec` exists; if not, we'll need an MCP-compatible spawn strategy.
- `uv` availability varies; consider detecting missing binary and surfacing actionable errors.
