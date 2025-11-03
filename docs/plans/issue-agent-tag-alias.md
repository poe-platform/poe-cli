# Plan: Support `poe-code` Tag Alias for Issue Resolution Agent

## Problem
Issue agent only recognizes `claude-code`, `codex`, `opencode` labels. Need to add `poe-code` as alias to `poe-cli agent` service.

## Goal
Label `poe-code` on issues should trigger agent using `poe-cli agent` service/model.

## Implementation

### 1. Update label trigger list
- Add `poe-code` to label array in `.github/workflows/issue-resolution-agent.yml:11`
```yaml
contains(fromJson('["claude-code","codex","opencode","poe-code"]'), ...)
```

### 2. Add provider mapping
- Map `poe-code` to `poe-cli agent` in provider determination step (line 44-49)
```js
"poe-code": { service: "poe-cli agent", model: "Claude-Sonnet-4.5" }
```

### 3. Update configure step
- Add `poe-cli agent` case to configuration switch (line 74-85)
```bash
poe-code)
  poe-setup configure "poe-cli agent"
  ;;
```

### 4. Update spawn command
- Service name passed directly, handles spaces (line 111)
```bash
poe-setup spawn "$SERVICE" "$PROMPT"
```

## Testing
- Create test issue
- Apply `poe-code` label
- Verify workflow triggers and configures `poe-cli agent`
- Confirm PR created with correct labels
