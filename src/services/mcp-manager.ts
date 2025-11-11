import { McpClient, type McpServerConfig } from "./mcp-client.js";
import type { Tool } from "./chat.js";
import type { FileSystem } from "../utils/file-system.js";
import path from "node:path";

export interface McpManagerConfig {
  servers: McpServerConfig[];
}

export class McpManager {
  private clients = new Map<string, McpClient>();
  private fs: FileSystem;
  private configPath: string;

  constructor(fs: FileSystem, homeDir: string) {
    this.fs = fs;
    this.configPath = path.join(homeDir, ".poe-code", "mcp-servers.json");
  }

  async loadConfig(): Promise<McpManagerConfig> {
    try {
      const content = await this.fs.readFile(this.configPath, "utf8");
      return JSON.parse(content);
    } catch {
      // Config doesn't exist, return empty
      return { servers: [] };
    }
  }

  async saveConfig(config: McpManagerConfig): Promise<void> {
    const dir = path.dirname(this.configPath);
    try {
      await this.fs.stat(dir);
    } catch {
      await this.fs.mkdir(dir, { recursive: true });
    }

    await this.fs.writeFile(
      this.configPath,
      JSON.stringify(config, null, 2),
      { encoding: "utf8" }
    );
  }

  async addServer(config: McpServerConfig): Promise<void> {
    const currentConfig = await this.loadConfig();

    // Check if server already exists
    const existingIndex = currentConfig.servers.findIndex(
      (s) => s.name === config.name
    );

    if (existingIndex >= 0) {
      currentConfig.servers[existingIndex] = config;
    } else {
      currentConfig.servers.push(config);
    }

    await this.saveConfig(currentConfig);
  }

  async removeServer(name: string): Promise<boolean> {
    const currentConfig = await this.loadConfig();
    const initialLength = currentConfig.servers.length;

    currentConfig.servers = currentConfig.servers.filter(
      (s) => s.name !== name
    );

    if (currentConfig.servers.length < initialLength) {
      await this.saveConfig(currentConfig);
      // Also disconnect the client if running
      await this.disconnectServer(name);
      return true;
    }

    return false;
  }

  async connectServer(name: string): Promise<void> {
    const config = await this.loadConfig();
    const serverConfig = config.servers.find((s) => s.name === name);

    if (!serverConfig) {
      throw new Error(`MCP server "${name}" not found in configuration`);
    }

    if (this.clients.has(name)) {
      throw new Error(`MCP server "${name}" is already connected`);
    }

    const client = new McpClient(serverConfig);

    client.on("error", (error) => {
      console.error(`[MCP ${name}] Error:`, error);
    });

    client.on("log", (message) => {
      console.log(`[MCP ${name}]`, message);
    });

    client.on("close", () => {
      this.clients.delete(name);
    });

    await client.connect();
    this.clients.set(name, client);
  }

  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      await client.disconnect();
      this.clients.delete(name);
    }
  }

  async connectAll(): Promise<void> {
    const config = await this.loadConfig();

    for (const serverConfig of config.servers) {
      try {
        if (!this.clients.has(serverConfig.name)) {
          await this.connectServer(serverConfig.name);
        }
      } catch (error) {
        console.error(
          `Failed to connect to MCP server "${serverConfig.name}":`,
          error
        );
      }
    }
  }

  async disconnectAll(): Promise<void> {
    const names = Array.from(this.clients.keys());
    for (const name of names) {
      await this.disconnectServer(name);
    }
  }

  getAllTools(): Tool[] {
    const tools: Tool[] = [];

    for (const [serverName, client] of this.clients.entries()) {
      if (!client.isConnected()) continue;

      const mcpTools = client.getTools();
      for (const mcpTool of mcpTools) {
        tools.push({
          type: "function",
          function: {
            name: `mcp__${serverName}__${mcpTool.name}`,
            description: `[MCP: ${serverName}] ${mcpTool.description}`,
            parameters: {
              type: "object",
              properties: mcpTool.inputSchema.properties,
              required: mcpTool.inputSchema.required
            }
          }
        });
      }
    }

    return tools;
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    // Tool name format: mcp__<servername>__<toolname>
    if (!toolName.startsWith("mcp__")) {
      throw new Error(`Not an MCP tool: ${toolName}`);
    }

    const parts = toolName.substring(5).split("__");
    if (parts.length !== 2) {
      throw new Error(`Invalid MCP tool name format: ${toolName}`);
    }

    const [serverName, actualToolName] = parts;

    const client = this.clients.get(serverName);
    if (!client || !client.isConnected()) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }

    return await client.callTool(actualToolName, args);
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys()).filter((name) =>
      this.clients.get(name)?.isConnected()
    );
  }

  async listServers(): Promise<
    Array<{ name: string; connected: boolean; toolCount: number }>
  > {
    const config = await this.loadConfig();

    return config.servers.map((server) => {
      const client = this.clients.get(server.name);
      const connected = client?.isConnected() || false;
      const toolCount = connected ? client!.getTools().length : 0;

      return {
        name: server.name,
        connected,
        toolCount
      };
    });
  }
}
