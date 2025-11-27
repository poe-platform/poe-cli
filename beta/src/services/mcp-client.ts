import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class McpClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private buffer = "";
  private tools: McpTool[] = [];
  private config: McpServerConfig;
  private initialized = false;

  constructor(config: McpServerConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.process) {
      throw new Error("Already connected");
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(this.config.command, this.config.args, {
        env: { ...process.env, ...this.config.env },
        stdio: ["pipe", "pipe", "pipe"]
      });

      this.process.on("error", (error) => {
        this.emit("error", error);
        reject(error);
      });

      if (this.process.stdout) {
        this.process.stdout.on("data", (data: Buffer) => {
          this.handleData(data.toString());
        });
      }

      if (this.process.stderr) {
        this.process.stderr.on("data", (data: Buffer) => {
          this.emit("log", `[${this.config.name}] ${data.toString()}`);
        });
      }

      this.process.on("close", (code) => {
        this.emit("close", code);
        this.cleanup();
      });

      // Initialize the connection
      this.initialize().then(resolve).catch(reject);
    });
  }

  private async initialize(): Promise<void> {
    const response = await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: "poe-code",
        version: "0.1.0"
      }
    });

    this.initialized = true;
    this.emit("initialized", response);

    // Discover available tools
    await this.discoverTools();
  }

  private async discoverTools(): Promise<void> {
    const response = (await this.sendRequest("tools/list", {})) as {
      tools: McpTool[];
    };

    this.tools = response.tools || [];
    this.emit("tools-discovered", this.tools);
  }

  getTools(): McpTool[] {
    return [...this.tools];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.initialized) {
      throw new Error("Client not initialized");
    }

    const response = (await this.sendRequest("tools/call", {
      name,
      arguments: args
    })) as {
      content: Array<{ type: string; text?: string }>;
    };

    // Extract text content from response
    if (response.content && Array.isArray(response.content)) {
      const textContent = response.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");
      return textContent;
    }

    return JSON.stringify(response);
  }

  private handleData(data: string): void {
    this.buffer += data;

    // Process complete JSON-RPC messages (newline-delimited)
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line) as JsonRpcResponse;
        this.handleMessage(message);
      } catch (error) {
        this.emit(
          "error",
          new Error(`Failed to parse message: ${line}, error: ${error}`)
        );
      }
    }
  }

  private handleMessage(message: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      this.emit("error", new Error(`Unexpected message id: ${message.id}`));
      return;
    }

    this.pendingRequests.delete(message.id);

    if (message.error) {
      pending.reject(
        new Error(`MCP Error: ${message.error.message} (${message.error.code})`)
      );
    } else {
      pending.resolve(message.result);
    }
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    if (!this.process || !this.process.stdin) {
      return Promise.reject(new Error("Not connected"));
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const requestStr = JSON.stringify(request) + "\n";
      this.process!.stdin!.write(requestStr, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // Add timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async disconnect(): Promise<void> {
    if (!this.process) {
      return;
    }

    this.process.kill();
    this.cleanup();
  }

  private cleanup(): void {
    this.process = null;
    this.initialized = false;
    this.tools = [];
    this.pendingRequests.clear();
    this.buffer = "";
  }

  isConnected(): boolean {
    return this.process !== null && this.initialized;
  }

  getName(): string {
    return this.config.name;
  }
}
