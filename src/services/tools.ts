import type { Tool, ToolExecutor } from "./chat.js";
import type { FileSystem } from "../utils/file-system.js";
import { spawn } from "node:child_process";
import path from "node:path";
import type { McpManager } from "./mcp-manager.js";

export interface ToolExecutorDependencies {
  fs: FileSystem;
  cwd: string;
  allowedPaths?: string[];
  mcpManager?: McpManager;
}

export class DefaultToolExecutor implements ToolExecutor {
  private fs: FileSystem;
  private cwd: string;
  private allowedPaths: string[];
  private mcpManager?: McpManager;

  constructor(dependencies: ToolExecutorDependencies) {
    this.fs = dependencies.fs;
    this.cwd = dependencies.cwd;
    this.allowedPaths = dependencies.allowedPaths || [dependencies.cwd];
    this.mcpManager = dependencies.mcpManager;
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    // Check if it's an MCP tool
    if (name.startsWith("mcp_") && this.mcpManager) {
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

    try {
      await this.fs.writeFile(absolutePath, content, { encoding: "utf8" });
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
}

export function getAvailableTools(mcpManager?: McpManager): Tool[] {
  const builtInTools: Tool[] = [
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read the contents of a file",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "The path to the file to read"
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
        description: "Write content to a file",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "The path to the file to write"
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
        description: "List files in a directory",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "The directory path to list (defaults to current directory)"
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
