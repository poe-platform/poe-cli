import type { FileSystem } from "../utils/file-system.js";
import type { AgentTask } from "../services/agent-task-registry.js";
import type { LoggerFn } from "./types.js";

export interface AgentToolCallEvent {
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  error?: string;
}

export interface AgentSession {
  getModel?(): string;
  setToolCallCallback?(callback: (event: AgentToolCallEvent) => void): void;
  sendMessage(
    prompt: string,
    options?: { signal?: AbortSignal; onChunk?: (chunk: string) => void }
  ): Promise<{ content: string }>;
  waitForAllTasks?(): Promise<void>;
  drainCompletedTasks?(): AgentTask[];
  dispose?(): Promise<void> | void;
}

export interface ChatServiceFactoryOptions {
  apiKey: string;
  model: string;
  cwd: string;
  homeDir: string;
  fs: FileSystem;
  logger: LoggerFn;
  awaitTasksOnDispose?: boolean;
}

export type ChatServiceFactory = (
  options: ChatServiceFactoryOptions
) => Promise<AgentSession> | AgentSession;
