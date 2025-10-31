import path from "node:path";
import * as fs from "node:fs";
import type { FileSystem } from "../utils/file-system.js";
import { DefaultToolExecutor, getAvailableTools } from "./tools.js";
import { McpManager } from "./mcp-manager.js";
import {
  PoeChatService,
  type ChatMessage,
  type ToolCallCallback
} from "./chat.js";
import { AgentTaskRegistry } from "./agent-task-registry.js";
import type { FsLike } from "./agent-task-registry.js";

export interface AgentSession {
  getModel(): string;
  setToolCallCallback(callback: ToolCallCallback): void;
  sendMessage(prompt: string): Promise<ChatMessage>;
  dispose(): Promise<void>;
}

export interface AgentSessionOptions {
  fs: FileSystem;
  cwd: string;
  homeDir: string;
  apiKey: string;
  model: string;
  logger: (message: string) => void;
}

export async function createAgentSession(
  options: AgentSessionOptions
): Promise<AgentSession> {
  const mcpManager = new McpManager(options.fs, options.homeDir);
  try {
    await mcpManager.connectAll();
  } catch (error) {
    options.logger(
      `Failed to connect to some MCP servers: ${formatError(error)}`
    );
  }

  let systemPrompt: string | undefined;
  try {
    const systemPromptPath = path.join(options.cwd, "SYSTEM_PROMPT.md");
    systemPrompt = await options.fs.readFile(systemPromptPath, "utf8");
  } catch {
    systemPrompt = undefined;
  }

  const cwdContext = `\n\nIMPORTANT: You are working in the directory: ${options.cwd}\nWhen accessing files, use paths relative to this directory.`;
  systemPrompt = systemPrompt ? `${systemPrompt}${cwdContext}` : cwdContext;

  const tasksDir = path.join(options.homeDir, ".poe-setup", "tasks");
  const logsDir = path.join(options.homeDir, ".poe-setup", "logs", "tasks");
  const nativeFs = fs as unknown as FsLike;
  const taskRegistry = new AgentTaskRegistry({
    fs: nativeFs,
    tasksDir,
    logsDir,
    logger: (event, payload) => {
      options.logger(`task:${event} ${JSON.stringify(payload ?? {})}`);
    }
  });

  const toolExecutor = new DefaultToolExecutor({
    fs: options.fs,
    cwd: options.cwd,
    allowedPaths: [options.cwd, options.homeDir],
    mcpManager,
    taskRegistry,
    onWriteFile: async ({ relativePath }) => {
      options.logger(`Tool write_file -> ${relativePath}`);
    }
  });

  let toolCallback: ToolCallCallback | undefined;
  const chatService = new PoeChatService(
    options.apiKey,
    options.model,
    toolExecutor,
    (event) => {
      toolCallback?.(event);
    },
    systemPrompt,
    taskRegistry
  );

  return {
    getModel() {
      return chatService.getModel();
    },
    setToolCallCallback(callback: ToolCallCallback) {
      toolCallback = callback;
      chatService.setToolCallCallback(callback);
    },
    async sendMessage(prompt: string) {
      const tools = getAvailableTools(mcpManager);
      return chatService.sendMessage(prompt, tools);
    },
    async dispose() {
      taskRegistry.dispose();
      await mcpManager.disconnectAll();
    }
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
