# Dummy OpenAI Chat Completions Endpoint - Plan

## Goal

Create a minimal `/v1/chat/completions` endpoint for testing without real API credentials.

## Behavior

1. **Echo**: Returns the same message content sent by user
2. **Tool call**: When `list_files` tool is present, returns fake tool call with file list `["src/", "package.json", "README.md", "tests/"]`

## Files to Create

```
src/services/dummy-openai.ts          # Handler function
vscode-extension/preview/server.js    # Mount endpoint (modify existing)
scripts/dummy-openai-server.mjs       # Standalone server
tests/dummy-openai.test.ts            # Unit tests only
```

## Implementation

- Handler exports a function that can be mounted to any Express app
- No authentication
- Preview server mounts at `POST /v1/chat/completions`
- Standalone server runs on port 8080

## Success Criteria

- ✅ Send "hello" → get "hello" back
- ✅ Request with list_files tool → returns fake tool call
- ✅ Works in preview server
- ✅ Works as standalone server
- ✅ Unit tests pass