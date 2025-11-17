# MCP (Model Context Protocol) Integration

Poe Code now supports the Model Context Protocol (MCP), allowing you to extend the AI's capabilities with additional tools from MCP servers.

## What is MCP?

MCP is a standard protocol that allows AI assistants to connect to external tools and services. MCP servers provide tools that the AI can discover and use automatically.

## Quick Start

### 1. Add an MCP Server

In interactive mode, add an MCP server with the `/mcp add` command:

```
> /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /Users/you/projects
```

This adds the official MCP filesystem server, giving the AI access to file operations in your projects directory.

### 2. List Available Servers

```
> /mcp
MCP Servers:
- filesystem (✓ connected, 5 tools)
```

### 3. View All Tools

```
> /tools
Built-in tools:
- read_file: Read the contents of a file
- write_file: Write content to a file
- list_files: List files in a directory
- run_command: Run a shell command
- search_web: Search the web

MCP tools:
- mcp_filesystem_read_file: [MCP: filesystem] Read file contents
- mcp_filesystem_write_file: [MCP: filesystem] Write to a file
- mcp_filesystem_list_directory: [MCP: filesystem] List directory contents
...
```

### 4. Use MCP Tools in Chat

The AI will automatically use MCP tools when appropriate:

```
> What TypeScript files are in my src directory?
Poe Code:
[uses mcp_filesystem_list_directory tool]
I found 15 TypeScript files in your src directory...
```

## MCP Commands

### `/mcp`
List all configured MCP servers and their status.

### `/mcp add <name> <command> [args...]`
Add a new MCP server.

**Examples:**
```
/mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path/to/dir
/mcp add memory npx -y @modelcontextprotocol/server-memory
/mcp add github npx -y @modelcontextprotocol/server-github
```

### `/mcp remove <name>`
Remove an MCP server from configuration.

```
/mcp remove filesystem
```

### `/mcp connect <name>`
Connect to a configured MCP server.

```
/mcp connect filesystem
```

### `/mcp disconnect <name>`
Disconnect from an MCP server.

```
/mcp disconnect filesystem
```

### `/mcp reconnect`
Disconnect and reconnect all MCP servers.

```
/mcp reconnect
```

## Popular MCP Servers

### Filesystem
Access local files and directories.
```
/mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path/to/dir
```

### Memory
Persistent key-value storage for the AI.
```
/mcp add memory npx -y @modelcontextprotocol/server-memory
```

### GitHub
Interact with GitHub repositories.
```
/mcp add github npx -y @modelcontextprotocol/server-github
```

### Brave Search
Web search using Brave Search API.
```
/mcp add brave npx -y @modelcontextprotocol/server-brave-search
```

### PostgreSQL
Query PostgreSQL databases.
```
/mcp add postgres npx -y @modelcontextprotocol/server-postgres
```

## Configuration Storage

MCP server configurations are stored in:
```
~/.poe-code/mcp-servers.json
```

Servers auto-connect when you start interactive mode.

## How It Works

1. **Discovery**: When an MCP server connects, it sends a list of available tools
2. **Integration**: MCP tools are automatically added to the AI's tool list
3. **Execution**: When the AI calls an MCP tool, it's routed to the appropriate server
4. **Results**: Tool results are sent back to the AI to complete the response

## Tool Naming

MCP tools are prefixed with `mcp_<servername>_` to avoid conflicts:
- `mcp_filesystem_read_file`
- `mcp_memory_set`
- `mcp_github_create_issue`

## Security

- MCP servers run as separate processes
- Only explicitly configured servers are connected
- You control which directories/resources servers can access
- All server configurations are stored locally

## Troubleshooting

### Server won't connect
Check that the command is correct and the MCP server package is available:
```
npx -y @modelcontextprotocol/server-filesystem /path/to/dir
```

### No tools showing up
Try reconnecting:
```
/mcp disconnect <name>
/mcp connect <name>
```

### Server crashes
Check the console output for error messages. Most MCP servers log to stderr.

## Learn More

- [MCP Documentation](https://modelcontextprotocol.io)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Building MCP Servers](https://modelcontextprotocol.io/docs/building-servers)
