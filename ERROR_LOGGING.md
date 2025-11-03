# Error Logging System

This document describes the comprehensive error logging system implemented in the CLI.

## Overview

The CLI now includes a robust error logging infrastructure that:

- Logs errors to files with automatic rotation
- Captures full stack traces
- Adds contextual information to errors
- Categorizes errors by type
- Supports both file and stderr logging
- Properly propagates errors through the application

## Components

### 1. ErrorLogger (`src/cli/error-logger.ts`)

The main error logging component that handles writing errors to files.

**Features:**
- Automatic log file rotation (default: 10MB max size, 5 backups)
- Structured error entries with timestamps
- Context preservation
- Stack trace capture
- Dual output (file + stderr)

**Location:** `~/.poe-setup/logs/errors.log`

**Usage:**
```typescript
const errorLogger = new ErrorLogger({
  fs: fileSystem,
  logDir: "/path/to/logs",
  logToStderr: true,
  maxSize: 10 * 1024 * 1024, // 10MB
  maxBackups: 5
});

// Log a simple error
errorLogger.logError(error, { operation: "login" });

// Log with full context
errorLogger.logErrorWithStackTrace(error, "API call", {
  endpoint: "https://api.poe.com/...",
  httpStatus: 500
});
```

### 2. Error Types (`src/cli/errors.ts`)

Categorized error classes for better error classification and handling.

**Error Classes:**

#### `CliError`
Base class for all CLI errors with context support.

```typescript
throw new CliError("Something went wrong", {
  component: "init",
  operation: "setup"
});
```

#### `ApiError`
API and HTTP-related errors.

```typescript
throw new ApiError("Request failed", {
  httpStatus: 500,
  endpoint: "https://api.poe.com/v1/...",
  context: {
    requestBody: {...},
    responseBody: {...}
  }
});
```

#### `ValidationError`
User input and configuration validation errors.

```typescript
throw new ValidationError("API key is required", {
  field: "apiKey",
  operation: "login"
});
```

#### `FileSystemError`
File operations errors.

```typescript
throw new FileSystemError("Failed to write file", {
  filePath: "/path/to/file",
  operation: "write"
});
```

#### `AuthenticationError`
Authentication and credential errors.

```typescript
throw new AuthenticationError("Invalid credentials", {
  credentialsPath: "~/.poe-setup/credentials.json"
});
```

#### `CommandExecutionError`
Command execution failures.

```typescript
throw new CommandExecutionError("Command failed", {
  command: "npm install",
  exitCode: 1
});
```

#### `PrerequisiteError`
Prerequisite check failures.

```typescript
throw new PrerequisiteError("Prerequisites not met", {
  checks: ["node", "npm"]
});
```

#### `ServiceError`
Service provider errors.

```typescript
throw new ServiceError("MCP service failed", {
  service: "claude-code"
});
```

### 3. Enhanced ScopedLogger (`src/cli/logger.ts`)

The console logger now includes error logging methods.

**New Methods:**

#### `errorWithStack(error, context?)`
Log an error with its stack trace.

```typescript
logger.errorWithStack(error, {
  operation: "configure",
  configFile: "config.json"
});
```

#### `logException(error, operation, context?)`
Log an exception during a specific operation.

```typescript
logger.logException(error, "API verification", {
  apiKey: "sk-***",
  endpoint: "https://api.poe.com"
});
```

## Integration

### Container Setup

The error logger is automatically integrated into the CLI container:

```typescript
// src/cli/container.ts
const errorLogger = new ErrorLogger({
  fs: dependencies.fs,
  logDir: environment.logDir,
  logToStderr: true
});

loggerFactory.setErrorLogger(errorLogger);
```

### Main Error Handler

The top-level error handler in `src/index.ts` catches all errors:

```typescript
try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof Error) {
    // Log with full context
    errorLogger.logErrorWithStackTrace(error, "CLI execution", {
      component: "main",
      argv: process.argv
    });

    // User-friendly display
    if (error instanceof CliError && error.isUserError) {
      console.error(error.message);
    } else {
      console.error(`Error: ${error.message}`);
      console.error(`See logs at ${logDir}/errors.log for details.`);
    }

    process.exit(1);
  }
}
```

## Usage Patterns

### In Command Handlers

Wrap command logic in try-catch and log errors:

```typescript
.action(async (options) => {
  const logger = container.loggerFactory.create({ scope: "command-name" });

  try {
    // Command logic
    await doSomething();
  } catch (error) {
    if (error instanceof Error) {
      logger.logException(error, "command-name", {
        operation: "specific-operation",
        ...additionalContext
      });
    }
    throw error; // Re-throw for top-level handler
  }
});
```

### In API Calls

Use typed errors for API failures:

```typescript
if (!response.ok) {
  throw new ApiError("Request failed", {
    httpStatus: response.status,
    endpoint: url,
    context: {
      requestBody,
      responseBody
    }
  });
}
```

### In Validation

Use ValidationError for user input issues:

```typescript
if (!apiKey) {
  throw new ValidationError("API key is required", {
    field: "apiKey",
    operation: "login"
  });
}
```

## Log Format

Error log entries follow this format:

```
[2025-11-03T12:34:56.789Z] ERROR: API request failed
Context: {"operation":"query","model":"GPT-4","httpStatus":500,"endpoint":"https://api.poe.com/v1/chat/completions"}
Stack trace:
Error: API request failed
    at createPoeApiClient (/path/to/api-client.ts:106:15)
    at async Command.<anonymous> (/path/to/query.ts:46:24)
```

## Log Rotation

Logs automatically rotate when they exceed the maximum size:

- Default max size: 10MB
- Default max backups: 5
- Backup naming: `errors.log.1`, `errors.log.2`, etc.
- Oldest backups are deleted automatically

## Debugging Tips

### Finding Error Logs

```bash
# View recent errors
tail -f ~/.poe-setup/logs/errors.log

# Search for specific errors
grep "ApiError" ~/.poe-setup/logs/errors.log

# View full stack traces
cat ~/.poe-setup/logs/errors.log | less
```

### Adding Context

When logging errors, include relevant context:

```typescript
logger.logException(error, "operation-name", {
  // What was being attempted
  operation: "configure-service",

  // Component/module
  component: "mcp-manager",

  // Input data (sanitized)
  input: { serviceName: "claude-code" },

  // State information
  state: { configured: false },

  // Any other relevant info
  additionalInfo: "..."
});
```

### Error Context Best Practices

1. **Never log sensitive data**: Sanitize API keys, passwords, tokens
2. **Include operation context**: What was being attempted
3. **Add component info**: Which part of the system
4. **Preserve error chain**: Keep original error info
5. **Use appropriate error types**: Select the right error class

## Migration Guide

### Updating Existing Code

To add error logging to existing commands:

1. Import error types:
```typescript
import { ValidationError, ApiError } from "../errors.js";
```

2. Wrap command logic:
```typescript
try {
  // existing code
} catch (error) {
  if (error instanceof Error) {
    logger.logException(error, "operation-name", {
      // context
    });
  }
  throw error;
}
```

3. Use typed errors:
```typescript
// Old
throw new Error("Invalid input");

// New
throw new ValidationError("Invalid input", {
  field: "fieldName",
  operation: "commandName"
});
```

## Testing

The error logging system preserves testability:

```typescript
// In tests, provide custom error logger
const mockErrorLogger = new ErrorLogger({
  fs: mockFileSystem,
  logDir: "/tmp/test-logs",
  logToStderr: false
});

loggerFactory.setErrorLogger(mockErrorLogger);
```

## Performance Considerations

- File I/O is synchronous but minimal
- Log rotation is lazy (only when needed)
- Context objects are JSON stringified
- Stack traces are captured automatically by Error class
- No significant performance impact on normal operation

## Future Enhancements

Potential improvements:

- [ ] Async file writing for better performance
- [ ] Structured logging (JSON format option)
- [ ] Log levels (debug, info, warn, error)
- [ ] Remote error reporting
- [ ] Error analytics/aggregation
- [ ] Custom error formatters
- [ ] Log filtering by component
