import React from "react";
import { render } from "ink";
import { InteractiveCli } from "./interactive.js";
import type { CliDependencies } from "./program.js";
import path from "node:path";
import * as nodeFs from "node:fs";
import { loadCredentials } from "../services/credentials.js";
import { PoeChatService } from "../services/chat.js";
import { DefaultToolExecutor, getAvailableTools } from "../services/tools.js";
import { McpManager } from "../services/mcp-manager.js";
import { createInteractiveCommandExecutor } from "./interactive-command-runner.js";
import { resolveCredentialsPath } from "./environment.js";
import { AgentTaskRegistry } from "../services/agent-task-registry.js";
import type { FsLike } from "../services/agent-task-registry.js";
import { handleTasksCommand } from "./interactive-tasks.js";

export async function launchInteractiveMode(
  dependencies: CliDependencies
): Promise<void> {
  const { fs: fileSystem, env } = dependencies;
  const credentialsPath = resolveCredentialsPath(env.homeDir);

  // Initialize MCP manager
  const mcpManager = new McpManager(fileSystem, env.homeDir);

  // Auto-connect to configured MCP servers
  try {
    await mcpManager.connectAll();
  } catch (error) {
    console.error("Failed to connect to some MCP servers:", error);
  }

  // Initialize chat service
  let chatService: PoeChatService | null = null;
  const apiKey = await loadCredentials({ fs: fileSystem, filePath: credentialsPath });

  // Tool call callback handler (will be set by React component)
  let toolCallHandler: ((toolName: string, args: Record<string, unknown>, result?: string, error?: string) => void) | undefined;

  // Load system prompt
  let systemPrompt: string | undefined;
  try {
    const systemPromptPath = path.join(env.cwd, "SYSTEM_PROMPT.md");
    systemPrompt = await fileSystem.readFile(systemPromptPath, "utf8");
  } catch {
    // System prompt file doesn't exist, use default behavior
  }

  // Add working directory context
  const cwdContext = `\n\nIMPORTANT: You are working in the directory: ${env.cwd}\nWhen accessing files, use relative paths from this directory (e.g., 'package.json', 'src/index.ts').\nPrefer using the built-in tools (read_file, write_file, list_files) over MCP tools for local file operations.`;
  systemPrompt = systemPrompt ? systemPrompt + cwdContext : cwdContext;

  const forwardToolCall = (event: {
    toolName: string;
    args: Record<string, unknown>;
    result?: string;
    error?: string;
  }) => {
    if (toolCallHandler) {
      toolCallHandler(event.toolName, event.args, event.result, event.error);
    }
  };

  const tasksDir = path.join(env.homeDir, ".poe-setup", "tasks");
  const logsDir = path.join(env.homeDir, ".poe-setup", "logs", "tasks");
  const fsLike = nodeFs as unknown as FsLike;
  const taskRegistry = new AgentTaskRegistry({
    fs: fsLike,
    tasksDir,
    logsDir,
    logger: (event, payload) => {
      dependencies.logger?.(`task:${event} ${JSON.stringify(payload ?? {})}`);
    }
  });

  async function initializeChatService(apiKeyValue: string): Promise<string> {
    const toolExecutor = new DefaultToolExecutor({
      fs: fileSystem,
      cwd: env.cwd,
      allowedPaths: [env.cwd, env.homeDir],
      mcpManager,
      taskRegistry,
      logger: (event, payload) => {
        dependencies.logger?.(`tool:${event} ${JSON.stringify(payload ?? {})}`);
      }
    });
    chatService = new PoeChatService(
      apiKeyValue,
      "Claude-Sonnet-4.5",
      toolExecutor,
      forwardToolCall,
      systemPrompt,
      taskRegistry
    );
    return "Chat service initialized with Claude-Sonnet-4.5";
  }

  if (apiKey) {
    await initializeChatService(apiKey);
  }

  const commandExecutor = await createInteractiveCommandExecutor({
    ...dependencies,
    logger: () => {}
  });

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

      if (slashCommand === "strategy") {
        if (!chatService) {
          return "Please login first with: login <api-key>";
        }

        if (slashArgs.length === 0) {
          const strategyInfo = chatService.getStrategyInfo();
          const isEnabled = chatService.isStrategyEnabled();
          return `Current strategy: ${strategyInfo}\nStatus: ${isEnabled ? "Enabled" : "Disabled"}\n\nAvailable strategies:\n- mixed - Alternate between GPT-5 and Claude-Sonnet-4.5\n- smart - Intelligently select based on task type\n- fixed - Always use the same model\n- round-robin - Cycle through all available models\n\nUsage:\n  /strategy mixed\n  /strategy smart\n  /strategy fixed <model-name>\n  /strategy round-robin [model1,model2,...]\n  /strategy enable\n  /strategy disable`;
        }

        const strategyType = slashArgs[0].toLowerCase();

        if (strategyType === "enable") {
          chatService.enableStrategy();
          return "Strategy enabled";
        }

        if (strategyType === "disable") {
          chatService.disableStrategy();
          return "Strategy disabled (using fixed model)";
        }

        if (strategyType === "mixed") {
          chatService.setStrategy({ type: "mixed" });
          return "Strategy set to: mixed (alternating between GPT-5 and Claude-Sonnet-4.5)";
        }

        if (strategyType === "smart") {
          chatService.setStrategy({ type: "smart" });
          return "Strategy set to: smart (intelligently selecting based on task type)";
        }

        if (strategyType === "fixed") {
          if (slashArgs.length < 2) {
            return "Usage: /strategy fixed <model-name>\n\nExample: /strategy fixed Claude-Sonnet-4.5";
          }
          const fixedModel = slashArgs.slice(1).join(" ");
          chatService.setStrategy({ type: "fixed", fixedModel: fixedModel as any });
          return `Strategy set to: fixed (always using ${fixedModel})`;
        }

        if (strategyType === "round-robin") {
          const customOrder = slashArgs.length > 1
            ? slashArgs.slice(1).join(" ").split(",").map(m => m.trim() as any)
            : undefined;
          chatService.setStrategy({ type: "round-robin", customOrder });
          return `Strategy set to: round-robin${customOrder ? ` (custom order: ${customOrder.join(", ")})` : " (using all available models)"}`;
        }

        return `Unknown strategy type: ${strategyType}\nType '/strategy' for help`;
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
        const builtInTools = tools.filter((t) => !t.function.name.startsWith("mcp__"));
        const mcpTools = tools.filter((t) => t.function.name.startsWith("mcp__"));

        let result = "Built-in tools:\n";
        result += builtInTools.map((t) => `- ${t.function.name}: ${t.function.description}`).join("\n");

        if (mcpTools.length > 0) {
          result += "\n\nMCP tools:\n";
          result += mcpTools.map((t) => `- ${t.function.name}: ${t.function.description}`).join("\n");
        }

        result += "\n\nUse '/mcp' to manage MCP servers";
        return result;
      }

      if (slashCommand === "tasks") {
        const output = await handleTasksCommand(slashArgs, {
          registry: taskRegistry,
          fs: fsLike,
          now: Date.now
        });
        return output;
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

    // Attempt to run a CLI command through the shared executor
    const parsedCommand = commandExecutor.identify(trimmedInput);
    if (parsedCommand) {
      let message = await commandExecutor.execute(parsedCommand);
      if (parsedCommand.command === "login") {
        const stored = await loadCredentials({ fs: fileSystem, filePath: credentialsPath });
        if (stored) {
          const chatMessage = await initializeChatService(stored);
          message = message ? `${message}\n${chatMessage}` : chatMessage;
        }
      } else if (parsedCommand.command === "logout") {
        chatService = null;
      }
      const rendered = message ?? "";
      return rendered.length > 0 ? rendered : "Command completed.";
    }

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
              const content = await fileSystem.readFile(absolutePath, "utf8");
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
            // Add model info to response
            const modelName = chatService.getModel();
            return `[Model: ${modelName}]\n\n${response.content || "No response from model"}`;
          } catch (error) {
            throw new Error(
              `Chat error: ${error instanceof Error ? error.message : String(error)}`
            );
          }
    } else {
      return `Please login first with: login <api-key>\n\nOr use one of these commands:\n- help\n- configure <service>\n- init <project-name>`;
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
        readdir: (path: string) => fileSystem.readdir(path),
        stat: (path: string) => fileSystem.stat(path)
      }
    })
  );

  await waitUntilExit();
  taskRegistry.dispose();
}
