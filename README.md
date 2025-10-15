# Poe Setup Scripts

CLI tool to configure Poe API for various development tools.

## Installation

```bash
# Run directly with npx (no installation needed)
npx poe-setup

# Or install globally
npm install -g poe-setup
```

## Usage

```bash
# Interactive mode
npx poe-setup
# or if installed globally: poe-setup

# Initialize new Python project with Poe API
npx poe-setup init
# Creates: .env, main.py (joke request example), requirements.txt

# Configure specific service (prompts for API key)
npx poe-setup configure claude-code
npx poe-setup configure codex

# Non-interactive mode (skip prompts)
npx poe-setup configure claude-code --api-key="your-key-here"

# Remove configuration
npx poe-setup remove claude-code
npx poe-setup remove codex
```

## Commands

### `init` - Initialize Python Project
Creates a new Python project with Poe API integration:
- `.env` - Environment variables with POE_API_KEY placeholder
- `main.py` - Example script that requests a joke from the API
- `requirements.txt` - Python dependencies (openai, python-dotenv)

Interactive prompts (similar to `npm init`):
- Project name
- POE API key
- Model selection (GPT-5, Claude-Sonnet-4.5, etc.)

### `configure` - Setup Development Tools
- **claude-code**: Sets up Anthropic API environment variables for Claude Code
- **codex**: Creates `~/.codex/config.toml` with Poe provider configuration

### `remove` - Cleanup Configurations
Removes service configurations and restores from backup if available

## Project Structure

```
src/
  commands/
    init.ts        # Python project scaffolding
  services/
    claude-code.ts # Claude Code setup/removal
    codex.ts       # Codex setup/removal
  templates/
    python/
      env.hbs           # .env template
      main.py.hbs       # main.py template
      requirements.txt.hbs
    codex/
      config.toml.hbs   # Codex config template
    claude-code/
      bashrc.hbs        # Bash exports template
  ui/
    interactive.tsx # React + Ink UI
  utils/
    bashrc.ts      # bashrc file operations
    files.ts       # file write/delete helpers
    backup.ts      # automatic file backup before changes
  index.ts         # CLI entry point
```

## Configuration Files

**Note:** All file modifications automatically create timestamped backups (e.g., `~/.bashrc.backup.2024-01-15T10-30-00`)

### Claude Code
Inserts into `~/.bashrc` from [`bashrc.hbs`](src/templates/claude-code/bashrc.hbs) template

### Codex
Creates `~/.codex/config.toml` from [`config.toml.hbs`](src/templates/codex/config.toml.hbs) template

## Templates

Template files use Handlebars (`.hbs`) for variable substitution with editor support.

### `env.hbs` → `.env`
```handlebars
POE_API_KEY={{apiKey}}
POE_BASE_URL=https://api.poe.com/v1
MODEL={{model}}
```

### `main.py.hbs` → `main.py`
```handlebars
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("POE_API_KEY"),
    base_url=os.getenv("POE_BASE_URL")
)

response = client.chat.completions.create(
    model=os.getenv("MODEL", "{{model}}"),
    messages=[{"role": "user", "content": "Tell me a joke"}]
)

print(response.choices[0].message.content)
```

### `requirements.txt.hbs` → `requirements.txt`
```handlebars
openai>=1.0.0
python-dotenv>=1.0.0
```

### `config.toml.hbs` → `~/.codex/config.toml`
```handlebars
model_provider = "poe"
model = "{{model}}"
model_reasoning_effort = "{{reasoningEffort}}"

[model_providers.poe]
name = "poe"
base_url = "https://api.poe.com/v1"
wire_api = "chat"
env_key = "POE_API_KEY"
```

### `bashrc.hbs` → inserted into `~/.bashrc`
```handlebars
export POE_API_KEY="{{apiKey}}"
export ANTHROPIC_API_KEY=$POE_API_KEY
export ANTHROPIC_BASE_URL="https://api.poe.com"
```

## Development

```bash
# Install dependencies
bun install

# Run in dev mode
bun run dev

# Build
bun run build

# Test
bun test
```

### Tech Stack
- **Bun**: Runtime and build tool
- **React + Ink**: Interactive CLI UI
- **Yoga**: Terminal layout system
- **Handlebars**: Template engine for file generation

### Adding New Services

Create a new file in [`src/services/`](src/services/):

```typescript
// src/services/your-service.ts
export async function configure(apiKey: string) {
  // Add env vars or create config files
}

export async function remove() {
  // Remove env vars or delete config files
}