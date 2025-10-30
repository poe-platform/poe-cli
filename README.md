# poe-setup

> Fast CLI to wire your local dev tools to the Poe API

## Quick Start

```bash
npm i -g poe-setup
poe-cli login
poe-cli configure claude-code
```

## Features

- 🚀 **90-second setup** for coding agents with Poe API
- 🤖 **Multiple agents** - Claude Code, Codex, OpenCode
- 💬 **Interactive mode** for conversational workflows
- ⚡ **Async spawning** with git worktree support

## Installation

```bash
npm i -g poe-setup
```

## Usage

### Authentication

```bash
poe-cli login
```

### Configure Coding Agents

```bash
# Claude Code
poe-cli configure claude-code

# Codex
poe-cli configure codex

# OpenCode
poe-cli configure opencode
```

### Interactive Mode

```bash
poe-cli
```

### Non-Interactive Mode

```bash
poe-cli agent "Recommend me Python web framework"
```

### Spawn Async Agents

```bash
poe-cli spawn claude-code "What is the best web framework?"
poe-cli spawn-git-worktree claude-code "Build me a random fun game"
```