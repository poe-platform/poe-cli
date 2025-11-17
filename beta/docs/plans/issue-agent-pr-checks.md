# Plan: Issue Resolution Agent PR Checks

## Problem
Agent creates PRs but PR checks don't run automatically.

## Root Cause
- `pr-checks-agent.yml` triggers on `workflow_run` completion
- Expects `agent/*` branch push, but `create-pull-request` action doesn't trigger `workflow_run` events
- GitHub security: actions can't trigger other workflows to prevent infinite loops

## Solution

### Option 1: Direct PR checks in agent workflow (Recommended)
- Run checks directly in `issue-resolution-agent.yml` after commit
```yaml
- run: npm ci && npm run build && npm test
  if: steps.create-pr.outputs.pull-request-number
```

### Option 2: Use workflow_call pattern
- Switch from `create-pull-request` action to manual git push
- Trigger `pr-checks-agent.yml` as reusable workflow immediately
```yaml
- name: Push & trigger checks
  run: git push && gh workflow run pr-checks.yml --ref $BRANCH
```

### Option 3: Use GITHUB_TOKEN with elevated permissions
- Pass PAT instead of default `GITHUB_TOKEN` to `create-pull-request`
- PAT-created PRs can trigger workflows
- Requires adding secret and security review

## Implementation Steps (Option 1)

1. Add check step to `issue-resolution-agent.yml:130`
```yaml
- run: npm ci && npm run build && npm test
```

2. Update to run conditionally only if changes exist
```yaml
if: steps.create-pull-request.outputs.pull-request-number != ''
```

3. Post check results as PR comment
```yaml
- uses: actions/github-script@v7
  with:
    script: github.rest.issues.createComment({body: ...})
```

4. Remove `pr-checks-agent.yml` (no longer needed)

## Alternative: Option 2 Implementation

1. Replace `create-pull-request` with manual git commands
```yaml
run: git checkout -b $BRANCH && git push -u origin $BRANCH
```

2. Invoke reusable workflow immediately
```yaml
uses: ./.github/workflows/pr-checks.yml
```

3. Then create PR via `gh pr create`

## Testing
- Label test issue with `claude-code`
- Verify checks run before PR created
- Check PR shows green checkmarks
