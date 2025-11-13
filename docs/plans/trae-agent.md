# Plan: Add trae-agent Support

## Problem
Currently, poe-code supports four agents (claude-code, codex, opencode, poe-code) but lacks support for trae-agent, which would provide an additional coding agent option for users.

## Goal
Add trae-agent as a supported agent in the poe-code ecosystem, enabling users to:
- Configure trae-agent via `poe-code configure trae-agent`
- Spawn trae-agent tasks via `poe-code spawn trae-agent`
- Use trae-agent for issue resolution via GitHub labels
- Access trae-agent in interactive mode

## Background
trae-agent is a coding assistant that can be integrated with the Poe API, similar to existing agents. Adding support will expand user choice and leverage the existing poe-code infrastructure.

## Implementation

### 1. Update Issue Resolution Workflow
**File:** `.github/workflows/issue-resolution-agent.yml`

- Add `trae-agent` to label trigger list (line 12):
```yaml
contains(fromJson('["claude-code","codex","opencode","poe-code","trae-agent"]'),
github.event.label.name)
```

- Update configure step to handle trae-agent (line 50-61):
```bash
claude-code|codex|opencode|trae-agent)
  poe-code configure "$SERVICE" --yes
  ;;
```

### 2. Update Provider Determination Script
**File:** `scripts/workflows/determine-provider.cjs`

- Add trae-agent mapping to providers map (line 18-24):
```js
const providers = new Map([
  ['claude-code', { service: 'claude-code', model: 'Claude-Sonnet-4.5' }],
  ['codex', { service: 'codex', model: 'Claude-Sonnet-4.5' }],
  ['open-code', { service: 'opencode', model: 'Claude-Sonnet-4.5' }],
  ['opencode', { service: 'opencode', model: 'Claude-Sonnet-4.5' }],
  ['poe-code', { service: 'poe-code agent', model: 'Claude-Sonnet-4.5' }],
  ['trae-agent', { service: 'trae-agent', model: 'Claude-Sonnet-4.5' }]
]);
```

### 3. Update Documentation
**File:** `README.md`

- Add trae-agent to features list (line 14):
```md
- Multiple agents - Claude Code, Codex, OpenCode, Trae Agent
```

- Add configuration example (line 40):
```bash
# Trae Agent
poe-code configure trae-agent
```

### 4. Provider Adapter (if needed)
If trae-agent requires a custom provider adapter:
- Create `src/providers/trae-adapter.ts`
- Implement standard provider interface
- Register in provider registry

## Configuration Requirements

### Poe API Setup
Users need to ensure trae-agent is available in their Poe account:
1. Access to trae-agent bot on Poe platform
2. Valid Poe API key with trae-agent permissions
3. Agent properly configured via `poe-code configure trae-agent`

### Model Selection
- Default model: Claude-Sonnet-4.5 (configurable)
- Can be overridden in provider configuration
- Supports all Poe-compatible models

## Testing Strategy

### Manual Testing
1. Configure trae-agent:
   ```bash
   poe-code configure trae-agent --yes
   ```

2. Test interactive mode:
   ```bash
   poe-code
   # Select trae-agent from agent list
   ```

3. Test spawn mode:
   ```bash
   poe-code spawn trae-agent "Write a hello world function"
   ```

4. Test GitHub workflow:
   - Create test issue
   - Apply `trae-agent` label
   - Verify workflow triggers
   - Confirm PR creation with correct labels

### Integration Testing
- Verify trae-agent appears in agent selection menus
- Confirm configuration persists correctly
- Test error handling for missing trae-agent access
- Validate branch naming: `agent/trae-agent/issue-N`
- Check PR labels: `agent:trae-agent`

## Benefits
- Expands agent options for users
- Leverages existing poe-code infrastructure
- No breaking changes to existing functionality
- Minimal code changes required
- Consistent user experience across all agents

## Risks & Mitigations

### Risk: trae-agent not available to all users
- **Mitigation:** Clear error messages when trae-agent is not configured
- **Mitigation:** Documentation about Poe API requirements

### Risk: Different model capabilities
- **Mitigation:** Use same model (Claude-Sonnet-4.5) as other agents
- **Mitigation:** Allow model override in configuration

### Risk: Workflow conflicts
- **Mitigation:** Follow existing patterns from other agents
- **Mitigation:** Test label-based triggering thoroughly

## Key Files to Modify

### Required Changes
1. `.github/workflows/issue-resolution-agent.yml` - Add trae-agent label support
2. `scripts/workflows/determine-provider.cjs` - Add provider mapping
3. `README.md` - Document trae-agent usage

### Optional Changes (if custom adapter needed)
4. `src/providers/trae-adapter.ts` - Custom provider implementation
5. `src/config/providers.ts` - Register trae-agent provider

## Rollout Plan

### Phase 1: Core Integration
- Add trae-agent to workflow triggers
- Update provider determination
- Test basic functionality

### Phase 2: Documentation
- Update README with trae-agent examples
- Add configuration guide
- Document any trae-agent specific features

### Phase 3: Validation
- Manual testing across all modes
- GitHub workflow integration testing
- User acceptance testing

## Future Enhancements
- Auto-detect available agents from Poe API
- Dynamic agent registration
- Agent capability comparison tools
- Custom prompts per agent type

## Success Criteria
- Users can configure trae-agent via CLI
- GitHub issues with `trae-agent` label trigger workflow
- PRs created with correct trae-agent attribution
- All existing tests continue to pass
- Documentation clearly explains trae-agent usage

## Timeline Estimate
- Implementation: 2-4 hours
- Testing: 1-2 hours
- Documentation: 1 hour
- Total: 4-7 hours

## Dependencies
- Access to trae-agent on Poe platform
- Valid Poe API credentials
- Existing poe-code infrastructure (no changes needed)

## References
- Existing agent patterns: `docs/plans/issue-agent-tag-alias.md`
- Provider configuration: `scripts/workflows/determine-provider.cjs`
- Issue workflow: `.github/workflows/issue-resolution-agent.yml`
