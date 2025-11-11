# poe-code

> Fast CLI to wire your local dev tools to the Poe API

## Quick Start

```bash
npm i -g poe-code
poe-code login
poe-code configure claude-code
```

## Features

- 🚀 **90-second setup** for coding agents with Poe API
- 🤖 **Multiple agents** - Claude Code, Codex, OpenCode
- 💬 **Interactive mode** for conversational workflows
- ⚡ **Async spawning** with git worktree support

## Installation

```bash
npm i -g poe-code
```

## Usage

### Authentication

```bash
poe-code login
```

### Configure Coding Agents

```bash
# Claude Code
poe-code configure claude-code

# Codex
poe-code configure codex

# OpenCode
poe-code configure opencode
```

### Interactive Mode

```bash
poe-code
```

### Non-Interactive Mode

```bash
poe-code agent "Recommend me Python web framework"
```

### Spawn Async Agents

```bash
poe-code spawn claude-code "What is the best web framework?"
poe-code spawn-git-worktree claude-code "Build me a random fun game"
```
