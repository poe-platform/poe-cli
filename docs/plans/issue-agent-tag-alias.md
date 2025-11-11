# Plan: Support `poe-code` Tag Alias for Issue Resolution Agent

## Problem
Issue agent only recognizes `claude-code`, `codex`, `opencode` labels. Need to add `poe-code` as alias to `poe-code agent` service.

## Goal
Label `poe-code` on issues should trigger agent using `poe-code agent` service/model.

## Implementation

### 1. Update label trigger list
- Add `poe-code` to label array in `.github/workflows/issue-resolution-agent.yml:11`
```yaml
contains(fromJson('["claude-code","codex","opencode","poe-code"]'), ...)
```

### 2. Add provider mapping
- Map `poe-code` to `poe-code agent` in provider determination step (line 44-49)
```js
"poe-code": { service: "poe-code agent", model: "Claude-Sonnet-4.5" }
```

### 3. Update configure step
- Add `poe-code agent` case to configuration switch (line 74-85)
```bash
poe-code)
  poe-code configure "poe-code agent"
  ;;
```

### 4. Update spawn command
- Service name passed directly, handles spaces (line 111)
```bash
poe-code spawn "$SERVICE" "$PROMPT"
```

## Testing
- Create test issue
- Apply `poe-code` label
- Verify workflow triggers and configures `poe-code agent`
- Confirm PR created with correct labels
