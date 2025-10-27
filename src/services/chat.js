"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoeChatService = void 0;
const model_strategy_js_1 = require("./model-strategy.js");
class PoeChatService {
    constructor(apiKey, model = "Claude-Sonnet-4.5", toolExecutor, onToolCall, systemPrompt) {
        this.conversationHistory = [];
        this.strategyEnabled = false;
        this.apiKey = apiKey;
        this.baseUrl = "https://api.poe.com/v1";
        this.currentModel = model;
        this.toolExecutor = toolExecutor;
        this.onToolCall = onToolCall;
        // Load saved strategy configuration
        const savedConfig = model_strategy_js_1.StrategyConfigManager.loadConfig();
        if (savedConfig) {
            this.modelStrategy = model_strategy_js_1.ModelStrategyFactory.createStrategy(savedConfig);
            // Enable strategy if it's not a fixed strategy with the same model
            this.strategyEnabled = !(savedConfig.type === "fixed" && savedConfig.fixedModel === model);
        }
        // Add system prompt if provided
        if (systemPrompt) {
            this.conversationHistory.push({
                role: "system",
                content: systemPrompt
            });
        }
    }
    setToolCallCallback(callback) {
        this.onToolCall = callback;
    }
    setModel(model) {
        this.currentModel = model;
    }
    getModel() {
        return this.currentModel;
    }
    setStrategy(config) {
        this.modelStrategy = model_strategy_js_1.ModelStrategyFactory.createStrategy(config);
        this.strategyEnabled = true;
        model_strategy_js_1.StrategyConfigManager.saveConfig(config);
    }
    getStrategy() {
        return this.modelStrategy;
    }
    getStrategyInfo() {
        if (!this.modelStrategy) {
            return "No strategy enabled (using fixed model)";
        }
        return `${this.modelStrategy.getName()}: ${this.modelStrategy.getDescription()}`;
    }
    disableStrategy() {
        this.strategyEnabled = false;
    }
    enableStrategy() {
        if (this.modelStrategy) {
            this.strategyEnabled = true;
        }
    }
    isStrategyEnabled() {
        return this.strategyEnabled;
    }
    getHistory() {
        return [...this.conversationHistory];
    }
    clearHistory() {
        this.conversationHistory = [];
    }
    addSystemMessage(content) {
        this.conversationHistory.push({
            role: "system",
            content
        });
    }
    async sendMessage(userMessage, tools) {
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
            if (assistantMessage.tool_calls &&
                assistantMessage.tool_calls.length > 0 &&
                this.toolExecutor) {
                // Execute all tool calls
                for (const toolCall of assistantMessage.tool_calls) {
                    let result;
                    let error;
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        // Notify callback that tool call is starting
                        if (this.onToolCall) {
                            this.onToolCall({
                                toolName: toolCall.function.name,
                                args
                            });
                        }
                        result = await this.toolExecutor.executeTool(toolCall.function.name, args);
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
                    }
                    catch (err) {
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
    detectMessageContext(message) {
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
        const hasCodeKeywords = codeKeywords.some(keyword => lowerMessage.includes(keyword));
        const hasReasoningKeywords = reasoningKeywords.some(keyword => lowerMessage.includes(keyword));
        // Determine message type
        let messageType = "general";
        if (hasCodeKeywords) {
            messageType = "code";
        }
        else if (hasReasoningKeywords) {
            messageType = "reasoning";
        }
        else if (message.length < 100) {
            messageType = "chat";
        }
        // Determine complexity based on message length and structure
        let complexity = "medium";
        if (message.length > 500 || message.split("\n").length > 10) {
            complexity = "complex";
        }
        else if (message.length < 100) {
            complexity = "simple";
        }
        return {
            messageType,
            complexity,
            previousModel: this.currentModel
        };
    }
    async makeApiRequest(tools) {
        const request = {
            model: this.currentModel,
            messages: this.conversationHistory,
            temperature: 0.7
        };
        if (tools && tools.length > 0) {
            request.tools = tools;
            console.log(`[DEBUG] Sending ${tools.length} tools to ${this.currentModel}`);
            console.log(`[DEBUG] Tool names: ${tools.map(t => t.function.name).join(", ")}`);
        }
        console.log(`[DEBUG] Request to Poe API:`, JSON.stringify(request, null, 2));
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
            throw new Error(`Poe API request failed (${response.status}): ${errorText}`);
        }
        const result = await response.json();
        console.log(`[DEBUG] Response from Poe API:`, JSON.stringify(result, null, 2));
        return result;
    }
}
exports.PoeChatService = PoeChatService;
//# sourceMappingURL=chat.js.map