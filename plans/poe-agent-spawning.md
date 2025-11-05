# Poe Agent Sub-Agent Spawning & Dynamic Configuration

## Current Architecture

**Existing Implementation:**
- `spawn_git_worktree` tool hardcodes 3 agents: `claude-code`, `codex`, `opencode`
- Tool definitions in `getAvailableTools()` use static enum: `["claude-code", "codex", "opencode"]`
- MCP tools dynamically loaded from `~/.poe-setup/mcp-servers.json` via McpManager
- No config file for managing available sub-agents

**Key Files:**
- `src/services/tools.ts:865-998` - Tool definitions (spawn_git_worktree @ line 941)
- `src/services/tools.ts:745-797` - Parsing logic with hardcoded validation
- `src/services/mcp-manager.ts` - MCP config loading pattern
- `src/commands/spawn-worktree.ts` - Core spawning logic

## Plan

### 1. Configuration File
**Location:** `~/.poe-setup/agent-config.json`

**Schema:**
```typescript
{
  "agents": [
    { "id": "claude-code", "enabled": true },
    { "id": "codex", "enabled": true },
    { "id": "opencode", "enabled": false },
    { "id": "poe-code", "enabled": true }
  ]
}
```

**Implementation:**
- Create `src/services/agent-config-manager.ts`
- Mirror MCP manager pattern for config loading
- Methods: `loadConfig()`, `getEnabledAgents()`, `updateAgent()`

### 2. Dynamic Tool Description

**Current (static):**
```typescript
enum: ["claude-code", "codex", "opencode"]
```

**New (dynamic):**
```typescript
// In getAvailableTools()
const agentConfig = await agentConfigManager.getEnabledAgents();
const enabledAgentIds = agentConfig.map(a => a.id);

// spawn_git_worktree tool definition
enum: enabledAgentIds,
description: `Agent identifier (${enabledAgentIds.join(' | ')})`
```

### 3. Configure Utility Enhancement

**Add Command:** `poe-setup configure agents`

**Features:**
- Interactive menu to enable/disable agents
- Validate agent spawn functions exist
- Auto-detect installed agents
- Save to `~/.poe-setup/agent-config.json`

**Pseudocode:**
```typescript
// src/cli/commands/configure-agents.ts
const detected = detectInstalledAgents(); // Check for CLIs
const current = agentConfig.getEnabledAgents();
const choices = detected.map(id => ({
  name: id,
  value: id,
  checked: current.includes(id)
}));
const selected = await prompts.multiSelect(choices);
await agentConfig.save({ agents: selected });
```

### 4. Agent Registry Pattern

**Create:** `src/services/agent-registry.ts`

**Purpose:** Centralize agent spawn functions & metadata

**Structure:**
```typescript
interface AgentAdapter {
  id: string;
  spawn: (opts: SpawnOptions) => Promise<Result>;
  detect: () => Promise<boolean>;
}

const registry = {
  "claude-code": { spawn: spawnClaudeCode, detect: ... },
  "codex": { spawn: spawnCodex, detect: ... },
  "opencode": { spawn: spawnOpenCode, detect: ... },
  "poe-code": { spawn: spawnPoeCode, detect: ... }
};
```

### 5. Backwards Compatibility

**Default Config:** If `agent-config.json` missing, use legacy defaults
```typescript
const DEFAULT_AGENTS = ["claude-code", "codex", "opencode"];
```

## Implementation Order

1. Create `AgentConfigManager` (mirror MCP manager)
2. Create `AgentRegistry` with adapters
3. Update `getAvailableTools()` to read config
4. Update `parseWorktreeArgs()` validation
5. Add `configure agents` CLI command
6. Add config init to `agent-session.ts`

## Testing Checklist

- [ ] Default config generated on first run
- [ ] Disabled agents not in tool enum
- [ ] Configure command persists changes
- [ ] Invalid agent IDs rejected
- [ ] New agents addable via registry
- [ ] MCP pattern consistency maintained
