import {
  ModelStrategy,
  StrategyConfig,
  ModelStrategyFactory,
  StrategyConfigManager,
  ModelContext,
} from "./model-strategy.js";
import type { AgentTaskRegistry } from "./agent-task-registry.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: Tool[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ToolExecutor {
  executeTool(name: string, args: Record<string, unknown>): Promise<string>;
}

export interface ToolCallEvent {
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  error?: string;
}

export type ToolCallCallback = (event: ToolCallEvent) => void;

export class PoeChatService {
  private apiKey: string;
  private baseUrl: string;
  private conversationHistory: ChatMessage[] = [];
  private currentModel: string;
  private toolExecutor?: ToolExecutor;
  private onToolCall?: ToolCallCallback;
  private modelStrategy?: ModelStrategy;
  private strategyEnabled: boolean = false;
  private taskRegistry?: AgentTaskRegistry;

  constructor(
    apiKey: string,
    model: string = "Claude-Sonnet-4.5",
    toolExecutor?: ToolExecutor,
    onToolCall?: ToolCallCallback,
    systemPrompt?: string,
    taskRegistry?: AgentTaskRegistry
  ) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.poe.com/v1";
    this.currentModel = model;
    this.toolExecutor = toolExecutor;
    this.onToolCall = onToolCall;
    this.taskRegistry = taskRegistry;

    // Load saved strategy configuration
    const savedConfig = StrategyConfigManager.loadConfig();
    if (savedConfig) {
      this.modelStrategy = ModelStrategyFactory.createStrategy(savedConfig);
      // Enable strategy if it's not a fixed strategy with the same model
      this.strategyEnabled = !(
        savedConfig.type === "fixed" && savedConfig.fixedModel === model
      );
    }

    // Add system prompt if provided
    if (systemPrompt) {
      this.conversationHistory.push({
        role: "system",
        content: systemPrompt
      });
    }
  }

  setToolCallCallback(callback: ToolCallCallback): void {
    this.onToolCall = callback;
  }

  setModel(model: string): void {
    this.currentModel = model;
  }

  getModel(): string {
    return this.currentModel;
  }

  setStrategy(config: StrategyConfig): void {
    this.modelStrategy = ModelStrategyFactory.createStrategy(config);
    this.strategyEnabled = true;
    StrategyConfigManager.saveConfig(config);
  }

  getStrategy(): ModelStrategy | undefined {
    return this.modelStrategy;
  }

  getStrategyInfo(): string {
    if (!this.modelStrategy) {
      return "No strategy enabled (using fixed model)";
    }
    return `${this.modelStrategy.getName()}: ${this.modelStrategy.getDescription()}`;
  }

  disableStrategy(): void {
    this.strategyEnabled = false;
  }

  enableStrategy(): void {
    if (this.modelStrategy) {
      this.strategyEnabled = true;
    }
  }

  isStrategyEnabled(): boolean {
    return this.strategyEnabled;
  }

  getHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  addSystemMessage(content: string): void {
    this.conversationHistory.push({
      role: "system",
      content
    });
  }

  async sendMessage(
    userMessage: string,
    tools?: Tool[]
  ): Promise<ChatMessage> {
    this.injectCompletedTasks();
    // Add user message to history
    this.conversationHistory.push({
      role: "user",
      content: userMessage
    });

    // Use strategy to select model if enabled
    if (this.strategyEnabled && this.modelStrategy) {
      const context = this.detectMessageContext(userMessage);
      const selectedModel = this.modelStrategy.getNextModel(context);
      this.currentModel = selectedModel;
    }

    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const response = await this.makeApiRequest(tools);

      const assistantMessage = response.choices[0].message;
      this.conversationHistory.push(assistantMessage);

      // Check if the model wants to call tools
      if (
        assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0 &&
        this.toolExecutor
      ) {
        // Execute all tool calls
        for (const toolCall of assistantMessage.tool_calls) {
          let result: string;
          let error: string | undefined;

          try {
            const args = JSON.parse(toolCall.function.arguments);

            // Notify callback that tool call is starting
            if (this.onToolCall) {
              this.onToolCall({
                toolName: toolCall.function.name,
                args
              });
            }

            result = await this.toolExecutor.executeTool(
              toolCall.function.name,
              args
            );

            // Notify callback of success
            if (this.onToolCall) {
              this.onToolCall({
                toolName: toolCall.function.name,
                args,
                result
              });
            }

            // Add tool result to conversation
            this.conversationHistory.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: result
            });
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);

            // Notify callback of error
            if (this.onToolCall) {
              this.onToolCall({
                toolName: toolCall.function.name,
                args: JSON.parse(toolCall.function.arguments),
                error
              });
            }

            // Add error as tool result
            this.conversationHistory.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: `Error: ${error}`
            });
          }
        }

        // Continue the conversation with tool results
        attempts++;
        continue;
      }

      // No more tool calls, return the final message
      return assistantMessage;
    }

    throw new Error("Maximum tool call iterations reached");
  }

  private injectCompletedTasks(): void {
    if (!this.taskRegistry) {
      return;
    }
    const completed = this.taskRegistry.getCompletedTasks();
    if (completed.length === 0) {
      return;
    }
    for (const task of completed) {
      const symbol = task.status === "completed" ? "✅" : task.status === "failed" ? "❌" : "⏹";
      const details = task.result ?? task.error ?? "Task finished.";
      this.conversationHistory.push({
        role: "system",
        content: `${symbol} Task ${task.id} finished\n\n${details}`
      });
    }
    this.taskRegistry.clearCompleted();
  }

  private detectMessageContext(message: string): ModelContext {
    const lowerMessage = message.toLowerCase();

    // Detect code-related keywords
    const codeKeywords = [
      "code", "function", "class", "implement", "debug", "error",
      "refactor", "optimize", "algorithm", "bug", "fix", "compile",
      "typescript", "javascript", "python", "java", "react", "component"
    ];

    // Detect reasoning keywords
    const reasoningKeywords = [
      "why", "how", "explain", "analyze", "compare", "evaluate",
      "reasoning", "logic", "understand", "clarify"
    ];

    const hasCodeKeywords = codeKeywords.some(keyword =>
      lowerMessage.includes(keyword)
    );
    const hasReasoningKeywords = reasoningKeywords.some(keyword =>
      lowerMessage.includes(keyword)
    );

    // Determine message type
    let messageType: ModelContext["messageType"] = "general";
    if (hasCodeKeywords) {
      messageType = "code";
    } else if (hasReasoningKeywords) {
      messageType = "reasoning";
    } else if (message.length < 100) {
      messageType = "chat";
    }

    // Determine complexity based on message length and structure
    let complexity: ModelContext["complexity"] = "medium";
    if (message.length > 500 || message.split("\n").length > 10) {
      complexity = "complex";
    } else if (message.length < 100) {
      complexity = "simple";
    }

    return {
      messageType,
      complexity,
      previousModel: this.currentModel
    };
  }

  private async makeApiRequest(
    tools?: Tool[]
  ): Promise<ChatCompletionResponse> {
    const request: ChatCompletionRequest = {
      model: this.currentModel,
      messages: this.conversationHistory,
      temperature: 0.7
    };

    if (tools && tools.length > 0) {
      request.tools = tools;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Poe API request failed (${response.status}): ${errorText}`
      );
    }

    const result = await response.json();

    return result;
  }
}
