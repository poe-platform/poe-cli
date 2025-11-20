# Kimi Agent Support

Goal: Add Kimi agent as a first-class provider alongside Claude Code, Roo-Code, OpenCode, and Codex.

## Objectives
- Allow selecting `kimi` as a provider in CLI and VS Code extension.
- Implement `KimiAdapter` with streaming, tools, and session lifecycle.
- Reuse existing agent/session abstractions; integrate with model strategy.
- Store and resolve Kimi credentials via existing credentials service.
- Provide templates for project bootstrapping when applicable.

## Scope
- No UI redesign; reuse existing provider selector and agent commands.
- CLI, core services, and extension integration.
- Documentation and minimal DX helpers.

## Assumptions
- Kimi exposes an HTTP API comparable to OpenAI/Anthropic style with SSE or chunked streaming.
- API key auth via `KIMI_API_KEY` env var.
- Tool calling supports JSON schema-like arguments (fallback to text if not available).

## Architecture
- Add `src/providers/kimi-adapter.ts` that implements the `ProviderAdapter` interface used by others.
- Register in `src/providers/index.ts` and core service registry `src/services/service-manifest.ts`.
- Add `src/services/kimi.ts` mirroring patterns from `claude-code.ts` and `opencode.ts` for chat loop and tool mediation.
- Extend `src/services/model-strategy.ts` with Kimi models and selection logic.
- Wire credentials in `src/services/credentials.ts` with a new key `kimi` using `KIMI_API_KEY` env var and config.

## CLI/Extension
- Expose `kimi` in `src/cli/options.ts` provider union and validation.
- Update `src/cli/commands/configure-agents.ts` to include Kimi in interactive setup.
- Ensure `vscode-extension/src/config/provider-settings.ts` lists Kimi provider and default model list.

## Streaming & Tools
- Implement event stream parser compatible with existing `chat.ts` expectations: tokens, deltas, tool_call, tool_result, error, done.
- Map Kimi tool calling to internal `ToolCall` structure; if not native, parse JSON fenced blocks `{"tool": ..., "args": ...}` via robust detection.
- Apply rate limiting/backoff using existing HTTP client wrapper `src/cli/http.ts` or local fetch with retry.

## Error Handling
- Standardize errors via `errors.ts`; map API codes to retriable vs fatal.
- Redact keys in logs; integrate with `task-logger.ts` for streaming transcripts.

## Configuration
- Add default models, e.g., `kimi-lite`, `kimi-pro`, `kimi-code` with capabilities flags: tool_calling, vision (if applicable).
- Allow override in user config. Surface via `configure` flow.

## Security
- Keys loaded from env and stored via credentials service; never written to logs.
- Respect `dry-run` pathways in tests and E2E flags.

## Templates
- If Kimi provides project scaffolds, add under `src/templates/kimi/` with minimal env script and README snippet.

## Testing Strategy
- Unit: Mirror existing provider tests (mock HTTP with memfs where FS is touched). No actual network.
- Integration: Extend provider selection/model strategy tests to include Kimi.
- E2E (optional): Simulate stream transcripts from fixtures.

## Rollout
- Phase 1: Adapter, registry registration, CLI exposure, docs.
- Phase 2: Tool-calling enhancement and advanced features (vision, images) if supported.
- Phase 3: Templates and quality polish.

## Risks & Mitigations
- API instability: isolate Kimi-specific logic inside adapter/service with a narrow surface; feature flags per capability.
- Tool calling divergence: start with text-encoded tool calls; add native mode when available.
- Rate limits: reuse backoff utilities; cache model capabilities.

## Deliverables
- New files: `src/providers/kimi-adapter.ts`, `src/services/kimi.ts`, optional templates.
- Updated registries and configuration to recognize `kimi`.
- Docs in `docs/plans/kimi-agent.md` and README provider matrix update.

## Open Questions
- Exact Kimi API endpoints and streaming protocol specifics.
- Tool calling native support and schema format.
- Model list and capability flags.