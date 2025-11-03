# POE Agent Configuration Management

## Overview
Store agent configurations in JSON, dynamically inject into tool descriptions at runtime.

## Config File Structure
```json
{
  "agents": [
    {
      "name": "agent-name",
      "bot_name": "poe-bot-name",
      "description": "What it does",
      "tools": ["tool1", "tool2"]
    }
  ]
}
```
- Location: `~/.poe-agents.json` or project-level `.poe-agents.json`
- Schema validation on load

## Configure Utility Updates
- Add `add-agent`, `remove-agent`, `list-agents` commands
- Interactive prompts: name, bot, description, tools (multi-select)
- Validate bot exists via API call
- CRUD operations: `config.agents.push({...}); fs.writeFileSync(...)`

## Tool Description Generation
- Load config on SDK init
- Build agent list markdown from config
- Inject into `Task` tool description's `subagent_type` section
- Template: `"- {name}: {description} (Tools: {tools})"`

## Benefits
- Single source of truth
- No code changes for new agents
- User-managed configurations
- Easy sharing across projects
