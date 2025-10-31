import type { Tool, ToolExecutor } from "./chat.js";
import type { FileSystem } from "../utils/file-system.js";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { McpManager } from "./mcp-manager.js";
import { spawnGitWorktree } from "../commands/spawn-worktree.js";
import { spawnCodex } from "./codex.js";
import { spawnClaudeCode } from "./claude-code.js";
import { spawnOpenCode } from "./opencode.js";
import { simpleGit as createSimpleGit } from "simple-git";
import type { CommandRunnerResult } from "../utils/prerequisites.js";
import type { AgentTaskRegistry } from "./agent-task-registry.js";

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
  agent: "codex" | "claude-code" | "opencode";
  prompt: string;
  agentArgs: string[];
  branch?: string;
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
    const command = args.command as string;

    if (!command) {
      throw new Error("Missing required parameter: command");
    }

    // Parse command into executable and args
    const parts = command.trim().split(/\s+/);
    const executable = parts[0];
    const commandArgs = parts.slice(1);

    return new Promise((resolve, reject) => {
      const child = spawn(executable, commandArgs, {
        cwd: this.cwd,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";

      if (child.stdout) {
        child.stdout.on("data", (data) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      child.on("error", (error) => {
        reject(new Error(`Command failed: ${error.message}`));
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(`Command exited with code ${code}\nStderr: ${stderr}`)
          );
        } else {
          resolve(stdout || stderr || "Command completed successfully");
        }
      });
    });
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
    const serializableArgs: Record<string, unknown> = {
      agent: parsed.agent,
      prompt: parsed.prompt,
      agentArgs: parsed.agentArgs
    };
    if (parsed.branch) {
      serializableArgs.branch = parsed.branch;
    }

    if (this.taskRegistry && this.spawnTask) {
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

    return await this.executeWorktreeSynchronously(parsed);
  }

  private createBackgroundSpawner(): BackgroundTaskSpawner {
    return (request) => {
      if (!this.taskRegistry) {
        return;
      }
      const runnerPath = fileURLToPath(new URL("./task-runner.js", import.meta.url));
      const payload = JSON.stringify({
        taskId: request.taskId,
        toolName: request.toolName,
        args: request.args,
        context: request.context,
        directories: {
          tasks: this.taskRegistry.getTasksDirectory(),
          logs: this.taskRegistry.getLogsDirectory()
        }
      });
      
      // Build human-readable command
      const commandParts = [request.toolName];
      if (request.args.agent) {
        commandParts.push(`--agent=${request.args.agent}`);
      }
      if (request.args.prompt) {
        commandParts.push(`--prompt="${request.args.prompt}"`);
      }
      if (Array.isArray(request.args.agentArgs) && request.args.agentArgs.length > 0) {
        commandParts.push(...request.args.agentArgs.map(String));
      }
      const commandString = commandParts.join(" ");
      
      try {
        const child = spawn(process.execPath, [runnerPath, "--payload", payload], {
          cwd: request.context.cwd,
          detached: true,
          stdio: "ignore",
          env: {
            ...process.env
          }
        });
        
        // Register error handler BEFORE unref to catch early errors
        child.once("error", (error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.eventLogger("task_spawn_failed", {
            id: request.taskId,
            message
          });
          this.taskRegistry?.updateTask(request.taskId, {
            status: "failed",
            error: `Process error: ${message}`,
            endTime: this.now()
          });
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
    input: ParsedWorktreeArgs
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
      if (input.agent === "codex") {
        return await spawnCodex({
          prompt: details.prompt,
          args: details.args,
          runCommand: runner
        });
      }
      if (input.agent === "claude-code") {
        return await spawnClaudeCode({
          prompt: details.prompt,
          args: details.args,
          runCommand: runner
        });
      }
      return await spawnOpenCode({
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

  private parseWorktreeArgs(args: Record<string, unknown>): ParsedWorktreeArgs {
    const agentValue = args.agent;
    if (typeof agentValue !== "string" || agentValue.length === 0) {
      throw new Error("Missing required parameter: agent");
    }
    if (agentValue !== "codex" && agentValue !== "claude-code" && agentValue !== "opencode") {
      throw new Error(`Unsupported agent "${agentValue}".`);
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

    return {
      agent: agentValue as ParsedWorktreeArgs["agent"],
      prompt: promptValue,
      agentArgs,
      branch: branchValue
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

export function getAvailableTools(mcpManager?: McpManager): Tool[] {
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
              description: "Agent identifier to launch (claude-code | codex | opencode).",
              enum: ["claude-code", "codex", "opencode"]
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
  if (mcpManager) {
    const mcpTools = mcpManager.getAllTools();
    return [...builtInTools, ...mcpTools];
  }

  return builtInTools;
}
