# Issue Resolution Agent Improvements

## 1. Enable PR Checks

**Problem:** PRs created by agent don't trigger checks (GitHub security prevents action-created events from triggering workflows)

**Solution:** Run checks inline before creating PR

**Changes:**
- Add check step after agent runs (line 129 in `issue-resolution-agent.yml`)
```yaml
- run: npm ci && npm run build && npm test
  if: steps.create-pull-request.outputs.pull-request-number != ''
```

- Post results as PR comment
```yaml
- uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        body: checkResults ? '✅ Checks passed' : '❌ Checks failed'
      })
```

- Remove `.github/workflows/pr-checks-agent.yml` (no longer needed)

## 2. Add `poe-code` Tag Support

**Problem:** Only `claude-code`, `codex`, `opencode` labels trigger agent

**Solution:** Add `poe-code` → `poe-code agent` mapping

**Changes:**
- Update label filter (line 11)
```yaml
contains(fromJson('["claude-code","codex","opencode","poe-code"]'), ...)
```

- Add provider mapping (line 44-49)
```js
"poe-code": { service: "poe-code agent", model: "Claude-Sonnet-4.5" }
```

- Add configure case (line 74-85)
```bash
"poe-code agent")
  poe-code configure "poe-code agent"
  ;;
```

**Note:** `poe-code spawn` already handles service names with spaces (line 111)

## Testing
- Create test issue with `poe-code` label → verify PR created
- Check inline tests run before PR creation
- Verify PR comment shows check results
