import React from "react";
import { render } from "ink";
import { InteractiveCli } from "./interactive.js";
import type { CliDependencies } from "./program.js";
import path from "node:path";
import { configureClaudeCode, registerClaudeCodePrerequisites } from "../services/claude-code.js";
import { configureCodex } from "../services/codex.js";
import { configureOpenCode } from "../services/opencode.js";
import { initProject } from "../commands/init.js";
import { loadCredentials, saveCredentials } from "../services/credentials.js";
import { createPrerequisiteManager } from "../utils/prerequisites.js";
import { PoeChatService } from "../services/chat.js";
import { DefaultToolExecutor, getAvailableTools } from "../services/tools.js";
import { McpManager } from "../services/mcp-manager.js";

export async function launchInteractiveMode(
  dependencies: CliDependencies
): Promise<void> {
  const { fs, prompts, env } = dependencies;
  const credentialsPath = path.join(env.homeDir, ".poe-setup", "credentials.json");

  // Initialize MCP manager
  const mcpManager = new McpManager(fs, env.homeDir);

  // Auto-connect to configured MCP servers
  try {
    await mcpManager.connectAll();
  } catch (error) {
    console.error("Failed to connect to some MCP servers:", error);
  }

  // Initialize chat service
  let chatService: PoeChatService | null = null;
  const apiKey = await loadCredentials({ fs, filePath: credentialsPath });

  // Tool call callback handler (will be set by React component)
  let toolCallHandler: ((toolName: string, args: Record<string, unknown>, result?: string, error?: string) => void) | undefined;

  // Load system prompt
  let systemPrompt: string | undefined;
  try {
    const systemPromptPath = path.join(env.cwd, "SYSTEM_PROMPT.md");
    systemPrompt = await fs.readFile(systemPromptPath, "utf8");
  } catch {
    // System prompt file doesn't exist, use default behavior
  }

  if (apiKey) {
    const toolExecutor = new DefaultToolExecutor({
      fs,
      cwd: env.cwd,
      allowedPaths: [env.cwd, env.homeDir],
      mcpManager
    });

    const onToolCall = (event: { toolName: string; args: Record<string, unknown>; result?: string; error?: string }) => {
      if (toolCallHandler) {
        toolCallHandler(event.toolName, event.args, event.result, event.error);
      }
    };

    chatService = new PoeChatService(apiKey, "Claude-Sonnet-4.5", toolExecutor, onToolCall, systemPrompt);
  }

  const setToolCallHandler = (handler: typeof toolCallHandler) => {
    toolCallHandler = handler;
  };

  const handleCommand = async (input: string): Promise<string> => {
    const trimmedInput = input.trim();

    // Check for slash commands
    if (trimmedInput.startsWith("/")) {
      const parts = trimmedInput.substring(1).split(/\s+/);
      const slashCommand = parts[0].toLowerCase();
      const slashArgs = parts.slice(1);

      if (slashCommand === "model") {
        if (slashArgs.length === 0) {
          const currentModel = chatService?.getModel() || "Not connected";
          return `Current model: ${currentModel}\n\nAvailable models:\n- Claude-Sonnet-4.5\n- GPT-5\n- GPT-4o\n- Claude-3.5-Sonnet\n\nUsage: /model <model-name>`;
        }

        const newModel = slashArgs.join(" ");
        if (!chatService) {
          return "Please login first with: login <api-key>";
        }

        chatService.setModel(newModel);
        return `Switched to model: ${newModel}`;
      }

      if (slashCommand === "clear") {
        if (!chatService) {
          return "Please login first with: login <api-key>";
        }
        chatService.clearHistory();
        return "Conversation history cleared";
      }

      if (slashCommand === "history") {
        if (!chatService) {
          return "Please login first with: login <api-key>";
        }
        const history = chatService.getHistory();
        return `Conversation history (${history.length} messages):\n${JSON.stringify(history, null, 2)}`;
      }

      if (slashCommand === "tools") {
        const tools = getAvailableTools(mcpManager);
        const builtInTools = tools.filter((t) => !t.function.name.startsWith("mcp_"));
        const mcpTools = tools.filter((t) => t.function.name.startsWith("mcp_"));

        let result = "Built-in tools:\n";
        result += builtInTools.map((t) => `- ${t.function.name}: ${t.function.description}`).join("\n");

        if (mcpTools.length > 0) {
          result += "\n\nMCP tools:\n";
          result += mcpTools.map((t) => `- ${t.function.name}: ${t.function.description}`).join("\n");
        }

        result += "\n\nUse '/mcp' to manage MCP servers";
        return result;
      }

      if (slashCommand === "mcp") {
        if (slashArgs.length === 0) {
          const servers = await mcpManager.listServers();
          if (servers.length === 0) {
            return `No MCP servers configured.

Add a server with:
  /mcp add <name> <command> [args...]

Example:
  /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path/to/dir`;
          }

          let result = "MCP Servers:\n";
          for (const server of servers) {
            const status = server.connected ? "✓ connected" : "✗ disconnected";
            result += `- ${server.name} (${status}, ${server.toolCount} tools)\n`;
          }

          result += `\nCommands:
  /mcp add <name> <command> [args...] - Add MCP server
  /mcp remove <name> - Remove MCP server
  /mcp connect <name> - Connect to server
  /mcp disconnect <name> - Disconnect from server
  /mcp reconnect - Reconnect all servers`;

          return result;
        }

        const mcpAction = slashArgs[0].toLowerCase();
        const mcpArgs = slashArgs.slice(1);

        if (mcpAction === "add") {
          if (mcpArgs.length < 2) {
            return "Usage: /mcp add <name> <command> [args...]\n\nExample:\n  /mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /path/to/dir";
          }

          const [name, command, ...args] = mcpArgs;
          await mcpManager.addServer({ name, command, args });

          // Try to connect immediately
          try {
            await mcpManager.connectServer(name);
            return `Added and connected to MCP server "${name}"`;
          } catch (error) {
            return `Added MCP server "${name}" but failed to connect: ${error instanceof Error ? error.message : String(error)}`;
          }
        }

        if (mcpAction === "remove") {
          if (mcpArgs.length === 0) {
            return "Usage: /mcp remove <name>";
          }

          const removed = await mcpManager.removeServer(mcpArgs[0]);
          if (removed) {
            return `Removed MCP server "${mcpArgs[0]}"`;
          } else {
            return `MCP server "${mcpArgs[0]}" not found`;
          }
        }

        if (mcpAction === "connect") {
          if (mcpArgs.length === 0) {
            return "Usage: /mcp connect <name>";
          }

          try {
            await mcpManager.connectServer(mcpArgs[0]);
            return `Connected to MCP server "${mcpArgs[0]}"`;
          } catch (error) {
            throw new Error(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        if (mcpAction === "disconnect") {
          if (mcpArgs.length === 0) {
            return "Usage: /mcp disconnect <name>";
          }

          await mcpManager.disconnectServer(mcpArgs[0]);
          return `Disconnected from MCP server "${mcpArgs[0]}"`;
        }

        if (mcpAction === "reconnect") {
          await mcpManager.disconnectAll();
          await mcpManager.connectAll();
          const servers = await mcpManager.listServers();
          const connected = servers.filter((s) => s.connected).length;
          return `Reconnected to ${connected}/${servers.length} MCP servers`;
        }

        return `Unknown MCP command: ${mcpAction}\nType '/mcp' for help`;
      }
    }

    // Check for regular commands (non-chat)
    const parts = trimmedInput.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case "help":
        return `Available commands:
  configure <service> - Configure a service (claude-code, codex, opencode)
  init <project-name> - Initialize a new project
  login <api-key> - Store your Poe API key
  logout - Remove stored API key
  test - Test your API key
  help - Show this help message
  exit - Exit interactive mode

Slash commands:
  /model [model-name] - View or switch the current model
  /clear - Clear conversation history
  /history - View conversation history
  /tools - List all available tools (built-in + MCP)
  /mcp - Manage MCP servers (add, remove, connect, etc.)

MCP (Model Context Protocol):
  /mcp - List all MCP servers
  /mcp add <name> <command> [args...] - Add MCP server
  /mcp remove <name> - Remove MCP server
  /mcp connect <name> - Connect to server
  /mcp disconnect <name> - Disconnect from server

Chat mode:
  Type any message to chat with the current model
  The model can use tools (built-in + MCP) to help you with tasks`;

      case "configure": {
        if (args.length === 0) {
          return "Usage: configure <service>\nAvailable services: claude-code, codex, opencode";
        }
        const service = args[0];

        try {
          const apiKey = await loadCredentials({ fs, filePath: credentialsPath });
          if (!apiKey && service !== "codex") {
            return "No API key found. Please run 'login' first or provide an API key.";
          }

          const prerequisites = createPrerequisiteManager({
            isDryRun: false,
            runCommand: async (cmd, cmdArgs) => {
              return { stdout: "", stderr: "", exitCode: 0 };
            }
          });

          if (service === "claude-code") {
            registerClaudeCodePrerequisites(prerequisites);
            await prerequisites.run("before");
            const settingsPath = path.join(env.homeDir, ".claude", "settings.json");
            await configureClaudeCode({ fs, apiKey: apiKey || "", settingsPath });
            await prerequisites.run("after");
            return `Successfully configured ${service}`;
          } else if (service === "codex") {
            const configPath = path.join(env.homeDir, ".codex", "config.toml");
            await configureCodex({
              fs,
              configPath,
              model: "gpt-5",
              reasoningEffort: "medium"
            });
            return `Successfully configured ${service}`;
          } else if (service === "opencode") {
            const configPath = path.join(env.homeDir, ".config", "opencode", "config.json");
            const authPath = path.join(env.homeDir, ".local", "share", "opencode", "auth.json");
            await configureOpenCode({ fs, apiKey: apiKey || "", configPath, authPath });
            return `Successfully configured ${service}`;
          } else {
            return `Unknown service: ${service}`;
          }
        } catch (error) {
          throw new Error(`Failed to configure ${service}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case "init": {
        if (args.length === 0) {
          return "Usage: init <project-name>";
        }
        const projectName = args[0];

        try {
          const apiKey = await loadCredentials({ fs, filePath: credentialsPath });
          if (!apiKey) {
            return "No API key found. Please run 'login' first.";
          }

          await initProject({
            fs,
            cwd: env.cwd,
            projectName,
            apiKey,
            model: "gpt-5"
          });
          return `Successfully initialized project "${projectName}"`;
        } catch (error) {
          throw new Error(`Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case "login": {
        if (args.length === 0) {
          return "Usage: login <api-key>";
        }
        const newApiKey = args.join(" ");

        try {
          await saveCredentials({ fs, filePath: credentialsPath, apiKey: newApiKey });

          // Initialize chat service with the new API key and MCP manager
          const toolExecutor = new DefaultToolExecutor({
            fs,
            cwd: env.cwd,
            allowedPaths: [env.cwd, env.homeDir],
            mcpManager
          });

          const onToolCall = (event: { toolName: string; args: Record<string, unknown>; result?: string; error?: string }) => {
            if (toolCallHandler) {
              toolCallHandler(event.toolName, event.args, event.result, event.error);
            }
          };

          chatService = new PoeChatService(newApiKey, "Claude-Sonnet-4.5", toolExecutor, onToolCall, systemPrompt);

          return `API key saved successfully to ${credentialsPath}\nChat service initialized with Claude-Sonnet-4.5`;
        } catch (error) {
          throw new Error(`Failed to save API key: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case "logout": {
        try {
          const exists = await loadCredentials({ fs, filePath: credentialsPath });
          if (!exists) {
            return "No API key found.";
          }
          await fs.unlink(credentialsPath);
          return "API key removed successfully";
        } catch (error) {
          throw new Error(`Failed to remove API key: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case "test": {
        const apiKey = await loadCredentials({ fs, filePath: credentialsPath });
        if (!apiKey) {
          return "No API key found. Please run 'login' first.";
        }
        return "API key verification not yet implemented in interactive mode. Use 'poe-setup test' instead.";
      }

      case "query":
        // Fall through to default case for chat

      default:
        // If chat service is initialized, treat this as a chat message
        if (chatService) {
          try {
            // Process @file mentions
            let processedInput = trimmedInput;
            const filePattern = /@([^\s]+)/g;
            const matches = [...trimmedInput.matchAll(filePattern)];
            
            if (matches.length > 0) {
              // Read all mentioned files
              const fileContents: string[] = [];
              for (const match of matches) {
                const filePath = match[1];
                try {
                  const absolutePath = path.isAbsolute(filePath)
                    ? filePath
                    : path.join(env.cwd, filePath);
                  const content = await fs.readFile(absolutePath, "utf8");
                  fileContents.push(`\n\n--- Content of ${filePath} ---\n${content}\n--- End of ${filePath} ---`);
                } catch (error) {
                  fileContents.push(`\n\n[Error reading ${filePath}: ${error instanceof Error ? error.message : String(error)}]`);
                }
              }
              
              // Append file contents to the message
              processedInput = trimmedInput.replace(filePattern, "").trim() + fileContents.join("");
            }

            const tools = getAvailableTools(mcpManager);
            const response = await chatService.sendMessage(processedInput, tools);
            return response.content || "No response from model";
          } catch (error) {
            throw new Error(
              `Chat error: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        } else {
          return `Please login first with: login <api-key>\n\nOr use one of these commands:\n- help\n- configure <service>\n- init <project-name>`;
        }
    }
  };

  // Cleanup MCP connections on exit
  const originalHandleExit = () => {
    void mcpManager.disconnectAll();
    console.log("Goodbye!");
  };

  const { waitUntilExit } = render(
    React.createElement(InteractiveCli, {
      onExit: originalHandleExit,
      onCommand: handleCommand,
      onSetToolCallHandler: setToolCallHandler,
      cwd: env.cwd,
      fs: {
        readdir: (path: string) => fs.readdir(path),
        stat: (path: string) => fs.stat(path)
      }
    })
  );

  await waitUntilExit();
}
