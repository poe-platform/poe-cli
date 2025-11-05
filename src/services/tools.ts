import type { Tool, ToolExecutor } from "./chat.js";
import type { FileSystem } from "../utils/file-system.js";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpManager } from "./mcp-manager.js";
import { spawnGitWorktree } from "../commands/spawn-worktree.js";
import { spawnClaudeCode } from "./claude-code.js";
import { simpleGit as createSimpleGit } from "simple-git";
import type { CommandRunnerResult } from "../utils/prerequisites.js";
import type { AgentTaskRegistry } from "./agent-task-registry.js";
import { tokenizeCommandLine } from "../utils/command-line.js";
import {
  AgentRegistry,
  createDefaultAgentRegistry,
  LEGACY_DEFAULT_AGENTS,
  type AgentAdapter
} from "./agent-registry.js";
import { AgentConfigManager } from "./agent-config-manager.js";

interface BackgroundTaskRequest {
  taskId: string;
  toolName: string;
  args: Record<string, unknown>;
  context: {
    cwd: string;
  };
}

type BackgroundTaskSpawner = (request: BackgroundTaskRequest) => Promise<void> | void;

interface ParsedWorktreeArgs {
  agent: string;
  prompt: string;
  agentArgs: string[];
  branch?: string;
  runAsync: boolean;
}

export interface ToolExecutorDependencies {
  fs: FileSystem;
  cwd: string;
  allowedPaths?: string[];
  mcpManager?: McpManager;
  onWriteFile?: (details: {
    absolutePath: string;
    relativePath: string;
    previousContent: string | null;
    nextContent: string;
  }) => void | Promise<void>;
  taskRegistry?: AgentTaskRegistry;
  spawnBackgroundTask?: BackgroundTaskSpawner;
  logger?: (event: string, payload?: Record<string, unknown>) => void;
  now?: () => number;
  agentRegistry?: AgentRegistry;
  agentConfigManager?: AgentConfigManager;
  homeDir?: string;
}

export class DefaultToolExecutor implements ToolExecutor {
  private fs: FileSystem;
  private cwd: string;
  private allowedPaths: string[];
  private mcpManager?: McpManager;
  private onWriteFile?: ToolExecutorDependencies["onWriteFile"];
  private taskRegistry?: AgentTaskRegistry;
  private spawnTask?: BackgroundTaskSpawner;
  private eventLogger: (event: string, payload?: Record<string, unknown>) => void;
  private now: () => number;
  private agentRegistry: AgentRegistry;
  private agentConfigManager?: AgentConfigManager;
  private homeDir?: string;

  constructor(dependencies: ToolExecutorDependencies) {
    this.fs = dependencies.fs;
    this.cwd = dependencies.cwd;
    this.allowedPaths = dependencies.allowedPaths || [dependencies.cwd];
    this.mcpManager = dependencies.mcpManager;
    this.onWriteFile = dependencies.onWriteFile;
    this.taskRegistry = dependencies.taskRegistry;
    this.eventLogger = dependencies.logger ?? (() => {});
    this.now = dependencies.now ?? Date.now;
    this.spawnTask =
      dependencies.spawnBackgroundTask ??
      (this.taskRegistry ? this.createBackgroundSpawner() : undefined);
    this.agentRegistry =
      dependencies.agentRegistry ?? createDefaultAgentRegistry();
    this.agentConfigManager = dependencies.agentConfigManager;
    this.homeDir = dependencies.homeDir;
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    // Check if it's an MCP tool
    if (name.startsWith("mcp__") && this.mcpManager) {
      return await this.mcpManager.executeTool(name, args);
    }

    switch (name) {
      case "read_file":
        return await this.readFile(args);
      case "write_file":
        return await this.writeFile(args);
      case "list_files":
        return await this.listFiles(args);
      case "run_command":
        return await this.runCommand(args);
      case "search_web":
        return await this.searchWeb(args);
      case "spawn_git_worktree":
        return await this.spawnGitWorktreeTool(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private isPathAllowed(filePath: string): boolean {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.cwd, filePath);

    return this.allowedPaths.some((allowedPath) =>
      absolutePath.startsWith(allowedPath)
    );
  }

  private async readFile(args: Record<string, unknown>): Promise<string> {
    const filePath = args.path as string;
    if (!filePath) {
      throw new Error("Missing required parameter: path");
    }

    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Access denied: ${filePath}`);
    }

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.cwd, filePath);

    try {
      const content = await this.fs.readFile(absolutePath, "utf8");
      return content;
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async writeFile(args: Record<string, unknown>): Promise<string> {
    const filePath = args.path as string;
    const content = args.content as string;

    if (!filePath || content === undefined) {
      throw new Error("Missing required parameters: path, content");
    }

    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Access denied: ${filePath}`);
    }

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.cwd, filePath);
    const previousContent = await this.tryReadFile(absolutePath);

    try {
      await this.fs.writeFile(absolutePath, content, { encoding: "utf8" });
      if (this.onWriteFile) {
        await this.onWriteFile({
          absolutePath,
          relativePath: path.relative(this.cwd, absolutePath),
          previousContent,
          nextContent: content
        });
      }
      return `Successfully wrote to ${filePath}`;
    } catch (error) {
      throw new Error(
        `Failed to write file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async listFiles(args: Record<string, unknown>): Promise<string> {
    const dirPath = (args.path as string) || ".";

    if (!this.isPathAllowed(dirPath)) {
      throw new Error(`Access denied: ${dirPath}`);
    }

    const absolutePath = path.isAbsolute(dirPath)
      ? dirPath
      : path.join(this.cwd, dirPath);

    try {
      const files = await this.fs.readdir(absolutePath);
      return JSON.stringify(files, null, 2);
    } catch (error) {
      throw new Error(
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async runCommand(args: Record<string, unknown>): Promise<string> {
    const commandValue = args.command;
    if (typeof commandValue !== "string" || commandValue.trim().length === 0) {
      throw new Error("Missing required parameter: command");
    }

    const tokens = tokenizeCommandLine(commandValue);
    if (tokens.length === 0) {
      throw new Error("Missing required parameter: command");
    }

    const [executable, ...commandArgs] = tokens;

    if (this.isManagedCommand(executable)) {
      return await this.runManagedCommand(executable, commandArgs);
    }

    return await this.executeExternalCommand(executable, commandArgs);
  }

  private isManagedCommand(command: string): boolean {
    return command === "claude-code" || command === "claude";
  }

  private async runManagedCommand(
    command: string,
    args: string[]
  ): Promise<string> {
    if (command === "claude-code" || command === "claude") {
      return await this.executeClaudeCodeCommand(args);
    }
    throw new Error(`Unsupported managed command "${command}".`);
  }

  private async executeClaudeCodeCommand(args: string[]): Promise<string> {
    if (args.length === 0) {
      throw new Error(
        "Claude Code requires a prompt argument (e.g. claude-code \"Write hello world\")."
      );
    }

    const [firstArg, ...rest] = args;
    const promptParts: string[] = [firstArg];
    let forwardedArgs: string[] = [];
    if (rest.length > 0) {
      const optionIndex = rest.findIndex((value) => value.startsWith("--"));
      if (optionIndex === -1) {
        promptParts.push(...rest);
      } else {
        promptParts.push(...rest.slice(0, optionIndex));
        forwardedArgs = rest.slice(optionIndex);
      }
    }
    const prompt = promptParts.join(" ").trim();
    if (prompt.length === 0) {
      throw new Error(
        "Claude Code requires a prompt argument (e.g. claude-code \"Write hello world\")."
      );
    }

    const result = await spawnClaudeCode({
      prompt,
      args: forwardedArgs,
      runCommand: (cmd, commandArgs) => this.runProcess(cmd, commandArgs)
    });

    if (result.exitCode !== 0) {
      if (this.isNotFoundError(result)) {
        throw new Error(
          "Claude Code CLI is not installed or not available in the PATH. Run `poe-cli configure claude-code` to install it."
        );
      }
      const detail = this.formatProcessOutput(result);
      const suffix = detail.length > 0 ? ` Details: ${detail}` : "";
      throw new Error(`Claude Code failed with exit code ${result.exitCode}.${suffix}`);
    }

    const output = this.formatProcessOutput(result);
    return output.length > 0 ? output : "Claude Code command completed successfully";
  }

  private async executeExternalCommand(
    executable: string,
    args: string[]
  ): Promise<string> {
    const result = await this.runProcess(executable, args);
    if (result.exitCode !== 0) {
      if (this.isNotFoundError(result)) {
        throw new Error(
          `Command "${executable}" is not installed or not available in the PATH.`
        );
      }
      const detail = this.formatProcessOutput(result);
      if (detail.length > 0) {
        throw new Error(`Command "${executable}" exited with code ${result.exitCode}.\n${detail}`);
      }
      throw new Error(`Command "${executable}" exited with code ${result.exitCode}.`);
    }

    const output = this.formatProcessOutput(result);
    return output.length > 0 ? output : "Command completed successfully";
  }

  private async runProcess(
    command: string,
    args: string[]
  ): Promise<CommandRunnerResult> {
    return await new Promise((resolve) => {
      let settled = false;
      let stdout = "";
      let stderr = "";

      const child = spawn(command, args, {
        cwd: this.cwd,
        stdio: ["ignore", "pipe", "pipe"]
      });

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string | Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string | Buffer) => {
        stderr += chunk.toString();
      });

      const finish = (result: CommandRunnerResult) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      child.on("error", (error: NodeJS.ErrnoException) => {
        const exitCode =
          typeof error.code === "number"
            ? error.code
            : typeof error.errno === "number"
            ? error.errno
            : 127;
        const message =
          error instanceof Error ? error.message : String(error ?? "error");
        const combinedStderr =
          stderr.length > 0 ? `${stderr}${stderr.endsWith("\n") ? "" : "\n"}${message}` : message;
        finish({
          stdout,
          stderr: combinedStderr,
          exitCode
        });
      });

      child.on("close", (code) => {
        finish({
          stdout,
          stderr,
          exitCode: code ?? 0
        });
      });
    });
  }

  private formatProcessOutput(result: CommandRunnerResult): string {
    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();
    if (stdout.length > 0 && stderr.length > 0) {
      return `${stdout}\n${stderr}`;
    }
    if (stdout.length > 0) {
      return stdout;
    }
    if (stderr.length > 0) {
      return stderr;
    }
    return "";
  }

  private isNotFoundError(result: CommandRunnerResult): boolean {
    const stderrLower = result.stderr.toLowerCase();
    if (stderrLower.includes("enoent")) {
      return true;
    }
    if (stderrLower.includes("not found")) {
      return true;
    }
    return result.exitCode === 127;
  }

  private async searchWeb(args: Record<string, unknown>): Promise<string> {
    const query = args.query as string;

    if (!query) {
      throw new Error("Missing required parameter: query");
    }

    // Placeholder for web search - in a real implementation, you'd integrate with a search API
    return `Web search functionality not yet implemented. Query: ${query}`;
  }

  private async spawnGitWorktreeTool(
    args: Record<string, unknown>
  ): Promise<string> {
    const parsed = this.parseWorktreeArgs(args);
    const adapter = await this.resolveAgent(parsed.agent);
    const serializableArgs: Record<string, unknown> = {
      agent: parsed.agent,
      prompt: parsed.prompt,
      agentArgs: parsed.agentArgs
    };
    if (parsed.branch) {
      serializableArgs.branch = parsed.branch;
    }

    if (parsed.runAsync) {
      serializableArgs.async = true;
    }

    if (parsed.runAsync && this.taskRegistry && this.spawnTask) {
      const taskId = this.taskRegistry.registerTask({
        toolName: "spawn_git_worktree",
        args: serializableArgs
      });
      await Promise.resolve(
        this.spawnTask({
          taskId,
          toolName: "spawn_git_worktree",
          args: serializableArgs,
          context: { cwd: this.cwd }
        })
      );
      this.eventLogger("task_queued", {
        id: taskId,
        tool: "spawn_git_worktree"
      });
      return `Started background task ${taskId}`;
    }

    return await this.executeWorktreeSynchronously(parsed, adapter);
  }

  private createBackgroundSpawner(): BackgroundTaskSpawner {
    return (request) => {
      if (!this.taskRegistry) {
        return;
      }
      
      // Build human-readable CLI command
      const commandParts = ["spawn-git-worktree"];
      if (request.args.agent) {
        commandParts.push(String(request.args.agent));
      }
      if (request.args.prompt) {
        commandParts.push(`"${request.args.prompt}"`);
      }
      if (Array.isArray(request.args.agentArgs) && request.args.agentArgs.length > 0) {
        commandParts.push(...request.args.agentArgs.map(String));
      }
      if (request.args.branch) {
        commandParts.push(`--branch ${request.args.branch}`);
      }
      const commandString = commandParts.join(" ");
      
      // Create inline script that imports and runs the task
      const taskData = JSON.stringify({
        taskId: request.taskId,
        toolName: request.toolName,
        args: request.args,
        cwd: request.context.cwd,
        tasksDir: this.taskRegistry.getTasksDirectory(),
        logsDir: this.taskRegistry.getLogsDirectory(),
        agentConfigPath: this.agentConfigManager?.getConfigPath() ?? null,
        homeDir: this.homeDir ?? null
      });
      
      const inlineScript = `
        import { spawnGitWorktree } from './commands/spawn-worktree.js';
        import { createDefaultAgentRegistry } from './services/agent-registry.js';
        import { AgentConfigManager } from './services/agent-config-manager.js';
        import { AgentTaskRegistry } from './services/agent-task-registry.js';
        import { TaskLogger } from './services/task-logger.js';
        import { simpleGit } from 'simple-git';
        import { spawn } from 'node:child_process';
        import * as fs from 'node:fs';
        import path from 'node:path';

        const data = ${taskData};
        const fsLike = fs;

        const taskRegistry = new AgentTaskRegistry({
          fs: fsLike,
          tasksDir: data.tasksDir,
          logsDir: data.logsDir
        });

        const logger = new TaskLogger({
          fs: fsLike,
          filePath: path.join(data.logsDir, data.taskId + '.log'),
          now: () => new Date()
        });

        const progressFile = path.join(data.tasksDir, data.taskId + '.progress.jsonl');
        const writeProgress = (update) => {
          fs.appendFileSync(progressFile, JSON.stringify(update) + '\\n');
        };

        const agentRegistry = createDefaultAgentRegistry();
        let agentConfigManager = null;
        if (data.agentConfigPath && data.homeDir) {
          agentConfigManager = new AgentConfigManager({
            fs: fs.promises,
            homeDir: data.homeDir,
            registry: agentRegistry
          });
          await agentConfigManager.loadConfig();
        }

        async function resolveAgent(adapterId) {
          const adapter = agentRegistry.get(adapterId);
          if (!adapter) {
            throw new Error('Unsupported agent "' + adapterId + '".');
          }
          if (agentConfigManager) {
            const enabled = await agentConfigManager.getEnabledAgents();
            if (!enabled.some((entry) => entry.id === adapterId)) {
              throw new Error('Agent "' + adapterId + '" is disabled in configuration.');
            }
          }
          return adapter;
        }

        async function runCommand(cmd, args, cwd) {
          return new Promise((resolve) => {
            const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '', stderr = '';
            child.stdout?.on('data', (d) => stdout += d);
            child.stderr?.on('data', (d) => stderr += d);
            child.on('close', (code) => resolve({ stdout, stderr, exitCode: code || 0 }));
          });
        }

        let agentAdapter;

        async function runAgent(details) {
          if (!agentAdapter) {
            agentAdapter = await resolveAgent(details.agent);
          }
          if (details.agent !== data.args.agent) {
            throw new Error('Mismatched agent "' + details.agent + '" (expected "' + data.args.agent + '").');
          }
          return await agentAdapter.spawn({
            prompt: details.prompt,
            args: details.args,
            runCommand: (c, a) => runCommand(c, a, details.cwd)
          });
        }

        (async () => {
          try {
            logger.info('Starting ' + data.toolName);
            writeProgress({ type: 'progress', message: 'Starting ' + data.toolName, timestamp: Date.now() });

            agentAdapter = await resolveAgent(data.args.agent);

            const git = simpleGit({ baseDir: data.cwd });
            const branch = data.args.branch || (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();

            await spawnGitWorktree({
              agent: data.args.agent,
              prompt: data.args.prompt,
              agentArgs: data.args.agentArgs || [],
              basePath: data.cwd,
              targetBranch: branch,
              runAgent,
              logger: (msg) => {
                logger.info(msg);
                writeProgress({ type: 'progress', message: msg, timestamp: Date.now() });
              }
            });

            const result = 'Worktree workflow completed successfully';
            taskRegistry.updateTask(data.taskId, { status: 'completed', result, endTime: Date.now() });
            writeProgress({ type: 'complete', result, timestamp: Date.now() });
            logger.info('Task completed');
          } catch (error) {
            const message = error?.message || String(error);
            taskRegistry.updateTask(data.taskId, { status: 'failed', error: message, endTime: Date.now() });
            writeProgress({ type: 'error', error: message, timestamp: Date.now() });
            logger.error('Task failed: ' + message);
            process.exit(1);
          } finally {
            taskRegistry.dispose();
          }
        })();
      `.trim();
      
      try {
        // Spawn node with inline script
        const child = spawn(process.execPath, ['--input-type=module', '-e', inlineScript], {
          cwd: path.join(fileURLToPath(new URL('.', import.meta.url)), '..'),
          detached: true,
          stdio: ["ignore", "pipe", "pipe"], // Capture stdout/stderr for streaming
          env: {
            ...process.env
          }
        });
        
        // Capture stdout/stderr for logging and streaming
        let stdoutData = "";
        let stderrData = "";
        if (child.stdout) {
          child.stdout.on("data", (data) => {
            const chunk = data.toString();
            stdoutData += chunk;
            this.eventLogger("task_stdout", {
              id: request.taskId,
              tool: request.toolName,
              chunk
            });
          });
        }
        if (child.stderr) {
          child.stderr.on("data", (data) => {
            const chunk = data.toString();
            stderrData += chunk;
            this.eventLogger("task_stderr", {
              id: request.taskId,
              tool: request.toolName,
              chunk
            });
          });
        }
        
        // Register error handler BEFORE unref to catch early errors
        child.once("error", (error) => {
          const message = error instanceof Error ? error.message : String(error);
          const parts: string[] = [message];
          if (stdoutData) {
            parts.push(`Stdout: ${stdoutData}`);
          }
          if (stderrData) {
            parts.push(`Stderr: ${stderrData}`);
          }
          const fullError = parts.join("\n");
          this.eventLogger("task_spawn_failed", {
            id: request.taskId,
            message: fullError
          });
          this.taskRegistry?.updateTask(request.taskId, {
            status: "failed",
            error: `Process error: ${fullError}`,
            endTime: this.now()
          });
        });
        
        // Also capture exit with non-zero code
        child.once("exit", (code, signal) => {
          if (code !== null && code !== 0) {
            const details: string[] = [`Process exited with code ${code}`];
            if (stdoutData) {
              details.push(`Stdout: ${stdoutData}`);
            }
            if (stderrData) {
              details.push(`Stderr: ${stderrData}`);
            }
            const exitError = details.join("\n");
            this.eventLogger("task_exit_error", {
              id: request.taskId,
              code,
              signal,
              stdout: stdoutData,
              stderr: stderrData
            });
            this.taskRegistry?.updateTask(request.taskId, {
              status: "failed",
              error: exitError,
              endTime: this.now()
            });
          }
        });
        
        child.unref();
        
        if (typeof child.pid === "number") {
          this.taskRegistry.updateTask(request.taskId, {
            pid: child.pid,
            command: commandString
          });
          this.eventLogger("task_spawned", {
            id: request.taskId,
            tool: request.toolName,
            pid: child.pid,
            command: commandString
          });
        } else {
          // No PID means spawn failed
          this.eventLogger("task_spawn_no_pid", {
            id: request.taskId
          });
          this.taskRegistry.updateTask(request.taskId, {
            status: "failed",
            error: "Failed to spawn process (no PID)",
            endTime: this.now()
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.eventLogger("task_spawn_error", {
          id: request.taskId,
          message
        });
        this.taskRegistry.updateTask(request.taskId, {
          status: "failed",
          error: `Spawn error: ${message}`,
          endTime: this.now()
        });
      }
    };
  }

  private async executeWorktreeSynchronously(
    input: ParsedWorktreeArgs,
    adapter: AgentAdapter
  ): Promise<string> {
    const git = createSimpleGit({ baseDir: this.cwd });
    const branch = input.branch
      ? input.branch
      : (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

    const logs: string[] = [];
    const runner = async (
      command: string,
      commandArgs: string[]
    ): Promise<CommandRunnerResult> =>
      runCommandInCwd(command, commandArgs, this.cwd);

    const runAgent = async (details: {
      agent: string;
      prompt: string;
      args: string[];
      cwd: string;
    }): Promise<CommandRunnerResult> => {
      if (details.agent !== input.agent) {
        throw new Error(
          `Mismatched agent "${details.agent}" (expected "${input.agent}").`
        );
      }
      return await adapter.spawn({
        prompt: details.prompt,
        args: details.args,
        runCommand: runner
      });
    };

    await spawnGitWorktree({
      agent: input.agent,
      prompt: input.prompt,
      agentArgs: input.agentArgs,
      basePath: this.cwd,
      targetBranch: branch,
      runAgent,
      logger: (message) => {
        logs.push(message);
      }
    });

    if (logs.length === 0) {
      logs.push("Worktree workflow completed.");
    }

    return logs.join("\n");
  }

  private async resolveAgent(agentId: string): Promise<AgentAdapter> {
    const adapter = this.agentRegistry.get(agentId);
    if (!adapter) {
      throw new Error(`Unsupported agent "${agentId}".`);
    }
    if (this.agentConfigManager) {
      const enabled = await this.agentConfigManager.getEnabledAgents();
      if (!enabled.some((entry) => entry.id === agentId)) {
        throw new Error(`Agent "${agentId}" is disabled in configuration.`);
      }
    } else if (!LEGACY_DEFAULT_AGENTS.some((legacy) => legacy === agentId)) {
      throw new Error(`Unsupported agent "${agentId}".`);
    }
    return adapter;
  }

  private parseWorktreeArgs(args: Record<string, unknown>): ParsedWorktreeArgs {
    const agentValue = args.agent;
    if (typeof agentValue !== "string" || agentValue.length === 0) {
      throw new Error("Missing required parameter: agent");
    }

    const promptValue = args.prompt;
    if (typeof promptValue !== "string" || promptValue.length === 0) {
      throw new Error("Missing required parameter: prompt");
    }

    const agentArgsValue = args.agentArgs;
    const agentArgs = Array.isArray(agentArgsValue)
      ? agentArgsValue.map((entry) => String(entry))
      : [];

    const branchValue =
      typeof args.branch === "string" && args.branch.length > 0
        ? args.branch
        : undefined;

    const asyncValue = args.async;
    let runAsync = false;
    if (typeof asyncValue === "boolean") {
      runAsync = asyncValue;
    } else if (typeof asyncValue === "string") {
      const normalized = asyncValue.trim().toLowerCase();
      if (normalized === "true") {
        runAsync = true;
      } else if (normalized === "false" || normalized.length === 0) {
        runAsync = false;
      } else {
        throw new Error(
          `Invalid async option "${asyncValue}". Expected boolean, "true", or "false".`
        );
      }
    } else if (asyncValue !== undefined) {
      throw new Error(
        `Invalid async option type "${typeof asyncValue}". Expected boolean or string.`
      );
    }

    return {
      agent: agentValue as ParsedWorktreeArgs["agent"],
      prompt: promptValue,
      agentArgs,
      branch: branchValue,
      runAsync
    };
  }

  private async tryReadFile(targetPath: string): Promise<string | null> {
    try {
      return await this.fs.readFile(targetPath, "utf8");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
  }
}

function runCommandInCwd(
  command: string,
  args: string[],
  cwd: string
): Promise<CommandRunnerResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string | Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string | Buffer) => {
      stderr += chunk.toString();
    });

    child.once("error", (error: NodeJS.ErrnoException) => {
      const message =
        error instanceof Error ? error.message : String(error);
      const exitCode =
        typeof error.code === "number"
          ? error.code
          : Number.isInteger(Number(error.code))
          ? Number(error.code)
          : 127;
      resolve({
        stdout,
        stderr: stderr ? `${stderr}${message}` : message,
        exitCode
      });
    });

    child.once("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: typeof code === "number" ? code : 0
      });
    });
  });
}

export interface GetAvailableToolsOptions {
  agentRegistry?: AgentRegistry;
  agentConfigManager?: AgentConfigManager;
  mcpManager?: McpManager;
}

export async function getAvailableTools(
  options: GetAvailableToolsOptions = {}
): Promise<Tool[]> {
  const registry = options.agentRegistry ?? createDefaultAgentRegistry();
  let enabledAgents = registry
    .list()
    .filter((adapter) => adapter.defaultEnabled ?? LEGACY_DEFAULT_AGENTS.some((legacy) => legacy === adapter.id))
    .map((adapter) => ({ id: adapter.id }));

  if (options.agentConfigManager) {
    enabledAgents = await options.agentConfigManager.getEnabledAgents();
  }

  const enabledIds = enabledAgents.map((entry) => entry.id);
  const fallbackIds = registry.list().map((adapter) => adapter.id);
  const enumValues = enabledIds.length > 0 ? enabledIds : fallbackIds;
  const agentDescription =
    enumValues.length > 0
      ? `Agent identifier (${enumValues.join(" | ")}).`
      : "Agent identifier.";

  const builtInTools: Tool[] = [
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read the contents of a file in the current working directory. Use this for reading project files. Supports relative paths (e.g., 'package.json', 'src/index.ts') and absolute paths.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "The file path to read. Can be relative to the current working directory or absolute."
            }
          },
          required: ["path"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "write_file",
        description: "Write or create a file in the current working directory. Use this for creating or updating project files. Supports relative and absolute paths.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "The file path to write. Can be relative to the current working directory or absolute."
            },
            content: {
              type: "string",
              description: "The content to write to the file"
            }
          },
          required: ["path", "content"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "list_files",
        description: "List files and directories in the current working directory or a specified directory. Use this to explore the project structure.",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "The directory path to list. Defaults to current working directory if not specified. Can be relative or absolute."
            }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "run_command",
        description: "Run a shell command in the current directory",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The shell command to run"
            }
          },
          required: ["command"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "spawn_git_worktree",
        description: "Create a git worktree, run an agent, and attempt to merge the resulting changes.",
        parameters: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              description: agentDescription,
              enum: enumValues
            },
            prompt: {
              type: "string",
              description: "Prompt text to provide to the agent."
            },
            agentArgs: {
              type: "array",
              description: "Additional arguments forwarded to the agent CLI.",
              items: {
                type: "string"
              },
              default: []
            },
            branch: {
              type: "string",
              description: "Target branch to merge into. Defaults to the current branch."
            }
          },
          required: ["agent", "prompt"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_web",
        description: "Search the web for information",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query"
            }
          },
          required: ["query"]
        }
      }
    }
  ];

  // Add MCP tools if manager is provided
  if (options.mcpManager) {
    const mcpTools = options.mcpManager.getAllTools();
    return [...builtInTools, ...mcpTools];
  }

  return builtInTools;
}
