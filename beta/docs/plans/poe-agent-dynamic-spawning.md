# Plan: Dynamic Sub-Agent Spawning for Poe Agent

## Current State
- Hardcoded 3 agents in `spawn_git_worktree` tool: codex, claude-code, opencode
- Provider adapters exist but not exposed to agent spawning
- Only worktree-based spawning available (no direct sub-agent calls)

## Goals
- Expose all configured provider adapters as spawnable agents
- Support spawning with/without worktree isolation
- Keep config-driven (only show what's installed/configured)

## Architecture Changes

### 1. Agent Registry
```ts
// src/services/agent-registry.ts
getSpawnableAgents() → {name, supportsWorktree, supportsInline}[]
```
- Query all provider adapters with `supportsSpawn: true`
- Check installation status dynamically
- Cache results per session

### 2. Tool Schema Generation
```ts
// src/services/tools.ts
generateSpawnToolSchema(agents[]) → ToolSchema
```
- Build enum from available agents at runtime
- Include worktree vs inline mode options
- Update on config changes

### 3. Spawn Dispatcher
```ts
// src/services/spawn-dispatcher.ts
dispatch(agent, prompt, {worktree?, async?}) → Result
```
- Route to provider adapter's `spawn()` method
- Handle worktree creation if requested
- Manage sync vs async execution

### 4. Provider Adapter Updates
- Add `spawnInline()` method for non-worktree spawning
- Existing `spawn()` already handles worktree context
- Return standardized result format

## Implementation Steps

### Phase 1: Infrastructure
- Create AgentRegistry service
- Add adapter discovery mechanism
- Implement spawn capability detection

### Phase 2: Tool Updates
- Replace hardcoded agent list with registry lookup
- Generate dynamic tool schemas
- Add `spawn_agent` tool (no worktree requirement)

### Phase 3: Execution
- Implement SpawnDispatcher
- Update background task spawner for any adapter
- Add inline execution path

### Phase 4: Configuration
- Add UI/CLI to view available agents
- Support enabling/disabling agents for spawning
- Persist spawn preferences

## Key Files

**New:**
- `src/services/agent-registry.ts` - Central agent discovery
- `src/services/spawn-dispatcher.ts` - Routing logic

**Modified:**
- `src/services/tools.ts` - Dynamic tool schema
- `src/providers/*.ts` - Add `spawnInline()` method
- `src/services/agent-session.ts` - Registry integration

## Tool Examples

**Before:**
```json
{
  "name": "spawn_git_worktree",
  "parameters": {
    "agent": {"enum": ["codex", "claude-code", "opencode"]}
  }
}
```

**After:**
```json
{
  "name": "spawn_agent",
  "parameters": {
    "agent": {"enum": ["<dynamic-from-registry>"]},
    "isolation": {"enum": ["worktree", "inline", "none"]}
  }
}
```

## Benefits
- Add new agents without code changes (just provider adapter)
- User controls which agents are spawnable via config
- Single spawning interface for all modes
- Better tool discovery and documentation

## Risks & Mitigations
- **Risk:** Tool schema changes break existing prompts
  - **Mitigation:** Keep `spawn_git_worktree` as alias, deprecate gradually
- **Risk:** Registry lookup adds latency
  - **Mitigation:** Cache during session init, lazy refresh
- **Risk:** Config complexity increases
  - **Mitigation:** Sensible defaults (all installed = spawnable)

## Future Extensions
- Agent capability negotiation (MCP-style)
- Nested agent spawning with depth limits
- Shared context between parent/child agents
- Agent result streaming to parent
