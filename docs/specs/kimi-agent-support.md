# Specification: Kimi Agent Support

**Issue**: #23
**Status**: Draft
**Author**: AI Assistant
**Date**: 2025-11-30

## Overview

This specification describes how to add support for the Kimi agent to the poe-code CLI tool, following the existing provider architecture pattern.

## Background

The poe-code codebase uses a provider-based architecture to support multiple AI coding agents (Claude Code, Codex, OpenCode). Each provider implements a standard interface for configuration, installation, testing, and spawning agent sessions.

## Goals

1. Add Kimi as a supported agent provider
2. Follow existing architectural patterns and conventions
3. Maintain consistency with other providers
4. Support configuration via CLI and GitHub workflows
5. Enable Kimi to resolve GitHub issues using the existing workflow

## Non-Goals

- Changing the core provider architecture
- Adding features specific to Kimi that other providers don't support
- Implementing custom workflow logic for Kimi

## Assumptions

1. Kimi is available as an npm package or binary
2. Kimi requires API key authentication (similar to Claude Code)
3. Kimi supports model selection
4. Kimi has a CLI interface that can execute prompts
5. Kimi configuration can be stored in user home directory

## Technical Design

### 1. Provider Implementation

**File**: `src/providers/kimi.ts`

#### Type Definitions

```typescript
type KimiPaths = {
  configDir: string;
  configFile: string;
  apiKeyFile: string;
};

type KimiConfigureOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;  // Optional custom API endpoint
};

type KimiRemoveOptions = {
  removeApiKey: boolean;
  removeConfig: boolean;
};

type KimiSpawnOptions = {
  prompt: string;
  args?: string[];
  model?: string;
};
```

#### Provider Definition

```typescript
export const kimiService = createProvider<
  KimiPaths,
  KimiConfigureOptions,
  KimiRemoveOptions,
  KimiSpawnOptions
>({
  name: "kimi",
  label: "Kimi",
  id: "kimi",
  summary: "Configure Kimi AI agent to use Poe as the API provider.",

  branding: {
    colors: {
      dark: "#6B46FF",   // Kimi brand color (TBD)
      light: "#8B6FFF"
    }
  },

  configurePrompts: {
    apiKey: {
      label: "Kimi API Key",
      type: "password",
      validate: (value) => value?.length > 0 || "API key is required"
    },
    model: {
      label: "Default Kimi model",
      defaultValue: DEFAULT_KIMI_MODEL,
      choices: KIMI_MODELS.map((id) => ({
        title: id,
        value: id
      }))
    },
    baseUrl: {
      label: "API Base URL (optional)",
      defaultValue: "https://api.moonshot.cn/v1",
      optional: true
    }
  },

  resolvePaths(env) {
    return {
      configDir: env.resolvePath("~/.kimi"),
      configFile: env.resolvePath("~/.kimi/config.json"),
      apiKeyFile: env.resolvePath("~/.kimi/api_key.sh")
    };
  },

  manifest: {
    "*": {
      configure: [
        ensureDirectory({
          path: "~/.kimi"
        }),
        writeTemplateMutation({
          target: "~/.kimi/api_key.sh",
          templateId: "kimi/api_key.sh.hbs",
          context: ({ options }) => ({
            apiKey: options.apiKey,
            baseUrl: options.baseUrl
          })
        }),
        makeExecutableMutation({
          target: "~/.kimi/api_key.sh"
        }),
        jsonMergeMutation({
          target: "~/.kimi/config.json",
          value: ({ options }) => ({
            defaultModel: options.model,
            apiEndpoint: options.baseUrl || "https://api.moonshot.cn/v1"
          })
        })
      ],
      remove: [
        jsonPruneMutation({
          target: "~/.kimi/config.json",
          paths: ["defaultModel", "apiEndpoint"]
        }),
        removeFileMutation({
          target: "~/.kimi/api_key.sh",
          condition: ({ options }) => options.removeApiKey
        }),
        removeFileMutation({
          target: "~/.kimi/config.json",
          condition: ({ options }) => options.removeConfig
        })
      ]
    }
  },

  install: {
    npm: {
      package: "kimi-agent",  // TBD: actual npm package name
      global: true
    }
  },

  test(context) {
    return context.runCheck(
      createCommandExpectationCheck({
        id: "kimi-cli-health",
        command: "kimi",
        args: ["--version"],
        expectedPattern: /kimi.*/i
      })
    );
  },

  spawn(context, options) {
    const args = [
      "exec",
      options.prompt,
      "--model", options.model || DEFAULT_KIMI_MODEL,
      ...(options.args ?? [])
    ];

    return context.command.runCommand("kimi", args, {
      env: {
        ...process.env,
        KIMI_API_KEY_PATH: context.paths.apiKeyFile
      }
    });
  },

  versionResolver(context) {
    return context.command.getCommandVersion("kimi", ["--version"]);
  }
});
```

### 2. Constants and Models

**File**: `src/cli/constants.ts`

Add Kimi model definitions:

```typescript
// Kimi Models
export const KIMI_MODELS = [
  "moonshot-v1-8k",
  "moonshot-v1-32k",
  "moonshot-v1-128k"
] as const;

export type KimiModel = (typeof KIMI_MODELS)[number];

export const DEFAULT_KIMI_MODEL: KimiModel = "moonshot-v1-32k";

// Update ModelId union type
export type ModelId =
  | ClaudeCodeModel
  | CodexModel
  | OpenCodeModel
  | KimiModel;
```

### 3. Template Files

**File**: `src/templates/kimi/api_key.sh.hbs`

```bash
#!/bin/bash
# Kimi API Key Configuration
# Generated by poe-code

export KIMI_API_KEY="{{apiKey}}"
{{#if baseUrl}}
export KIMI_API_BASE_URL="{{baseUrl}}"
{{/if}}
```

### 4. Provider Registration

**File**: `src/providers/index.ts`

```typescript
import { kimiService } from "./kimi.js";

export function getDefaultProviders(): ProviderService[] {
  return [
    claudeCodeService,
    codexService,
    openCodeService,
    kimiService  // Add here
  ];
}
```

### 5. Workflow Integration

**File**: `scripts/workflows/determine-provider.ts`

```typescript
const PROVIDERS = new Map<string, ProviderMetadata>([
  ["claude-code", { service: "claude-code", model: DEFAULT_CLAUDE_CODE_MODEL }],
  ["codex", { service: "codex", model: DEFAULT_CODEX_MODEL }],
  ["opencode", { service: "opencode", model: DEFAULT_FRONTIER_MODEL }],
  ["kimi", { service: "kimi", model: DEFAULT_KIMI_MODEL }]  // Add here
]);
```

**File**: `.github/workflows/issue-resolution-agent.yml`

Update install, configure, and test steps to include kimi cases:

```yaml
- name: Install Provider
  run: |
    case "${{ needs.setup.outputs.service }}" in
      "claude-code")
        npm install -g @anthropic-ai/claude-code
        ;;
      "codex")
        npm install -g @openai/codex
        ;;
      "opencode")
        npm install -g opencode-ai
        ;;
      "kimi")
        npm install -g kimi-agent  # TBD: actual package
        ;;
      *)
        echo "Unknown service: ${{ needs.setup.outputs.service }}"
        exit 1
        ;;
    esac

# Similar updates for configure and test steps
```

### 6. Testing Strategy

Following TDD principles, tests must be written first:

#### Unit Tests

**File**: `tests/providers/kimi.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import { kimiService } from "../../src/providers/kimi.js";

describe("Kimi Provider", () => {
  beforeEach(() => {
    vol.reset();
  });

  it("should configure kimi with API key and model", async () => {
    // Test configuration mutation
  });

  it("should create api_key.sh file with correct permissions", async () => {
    // Test file creation and executable flag
  });

  it("should merge config.json without overwriting", async () => {
    // Test deep merge behavior
  });

  it("should remove configuration when requested", async () => {
    // Test removal mutations
  });

  it("should spawn kimi with correct arguments", async () => {
    // Test spawn command construction
  });

  it("should pass health check when kimi is installed", async () => {
    // Test the test() method
  });
});
```

#### Integration Tests

**File**: `tests/integration/kimi-workflow.test.ts`

```typescript
describe("Kimi Workflow Integration", () => {
  it("should install, configure, test, and spawn kimi", async () => {
    // End-to-end workflow test
  });
});
```

## Implementation Plan

### Phase 1: Core Provider (TDD)
1. Write tests for kimi provider (following TDD)
2. Implement `src/providers/kimi.ts`
3. Add constants to `src/cli/constants.ts`
4. Create template files in `src/templates/kimi/`
5. Run tests until green
6. **Commit**: `feat: add kimi provider implementation`

### Phase 2: Registration
1. Update `src/providers/index.ts`
2. Test provider registration
3. **Commit**: `feat: register kimi provider in service registry`

### Phase 3: Workflow Integration
1. Update `scripts/workflows/determine-provider.ts`
2. Update `.github/workflows/issue-resolution-agent.yml`
3. Test workflow locally
4. **Commit**: `feat: add kimi support to GitHub workflows`

### Phase 4: Documentation (with permission)
1. Ask user if README should be updated
2. If approved, add kimi examples to README
3. **Commit**: `docs: add kimi agent documentation`

## Open Questions

1. **Kimi Package Details**:
   - What is the actual npm package name?
   - Is it available on npm registry?
   - What is the CLI command name? (`kimi`, `kimi-agent`, etc.)

2. **Authentication**:
   - How does Kimi authenticate? (API key, token, other?)
   - Where should credentials be stored?
   - Does Kimi support environment variables?

3. **Model Support**:
   - What models does Kimi support?
   - What are the model naming conventions?
   - What is the recommended default model?

4. **CLI Interface**:
   - What is the command structure? (`kimi exec`, `kimi run`, etc.)
   - How are prompts passed to Kimi?
   - What arguments does Kimi accept?

5. **Configuration Format**:
   - What configuration files does Kimi use?
   - What format? (JSON, TOML, YAML, INI?)
   - What configuration options are required vs optional?

6. **API Endpoint**:
   - What is the default API endpoint?
   - Does Kimi support custom endpoints?
   - Is this Moonshot AI's Kimi (https://www.moonshot.cn/)?

## Dependencies

- No new npm dependencies required for core implementation
- Kimi agent package itself (exact package TBD)
- Existing mutation system handles all file operations

## Testing Plan

1. **Unit Tests**: Test each provider method in isolation using `memfs`
2. **Integration Tests**: Test full configure → test → spawn workflow
3. **Manual Testing**: Test in actual environment with real Kimi installation
4. **CI Testing**: Ensure GitHub workflow can use Kimi provider

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Kimi CLI interface differs from assumptions | High | Research Kimi documentation before implementation |
| Kimi not available as npm package | High | Support alternative installation methods |
| Configuration format incompatible with mutations | Medium | Add custom mutation if needed |
| Authentication mechanism different than expected | Medium | Implement custom authentication flow |

## Success Criteria

1. ✅ Kimi provider implements all required methods
2. ✅ All tests pass (following TDD)
3. ✅ `poe-code configure kimi` successfully configures Kimi
4. ✅ `poe-code test kimi` validates Kimi installation
5. ✅ `poe-code spawn kimi "prompt"` executes successfully
6. ✅ GitHub workflow can resolve issues using Kimi
7. ✅ No breaking changes to existing providers
8. ✅ Code follows SOLID, YAGNI, KISS principles

## Future Enhancements

- Support for multiple Kimi API keys (personal, team)
- Kimi-specific configuration options
- Custom prompt templates for Kimi
- Integration with Kimi's advanced features

## References

- Existing provider implementations: `src/providers/claude-code.ts`, `src/providers/codex.ts`
- Provider factory: `src/providers/create-provider.ts`
- Service registry: `src/cli/service-registry.ts`
- Project principles: `CLAUDE.md`

## Approval

This specification requires:
- [ ] Technical review
- [ ] Answers to open questions
- [ ] User approval to proceed with implementation
