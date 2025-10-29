import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Available model identifiers
 */
export const AVAILABLE_MODELS = [
  "Claude-Sonnet-4.5",
  "GPT-5",
  "GPT-4o",
  "Claude-3.5-Sonnet",
  "GPT-5-Codex",
] as const;

export type ModelIdentifier = (typeof AVAILABLE_MODELS)[number];

/**
 * Strategy types for model selection
 */
export type StrategyType = "mixed" | "smart" | "fixed" | "round-robin";

/**
 * Configuration for model strategy
 */
export interface StrategyConfig {
  type: StrategyType;
  fixedModel?: ModelIdentifier;
  customOrder?: ModelIdentifier[];
}

/**
 * Base interface for all model strategies
 */
export interface ModelStrategy {
  getNextModel(context?: ModelContext): ModelIdentifier;
  getName(): string;
  getDescription(): string;
  reset(): void;
}

/**
 * Context for smart model selection
 */
export interface ModelContext {
  messageType?: "code" | "chat" | "reasoning" | "general";
  complexity?: "simple" | "medium" | "complex";
  previousModel?: string;
}

/**
 * Mixed strategy: alternates between GPT-5 and Claude-Sonnet-4.5
 */
export class MixedStrategy implements ModelStrategy {
  private currentIndex = 0;
  private models: ModelIdentifier[] = ["GPT-5", "Claude-Sonnet-4.5"];

  getNextModel(): ModelIdentifier {
    const model = this.models[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.models.length;
    return model;
  }

  getName(): string {
    return "mixed";
  }

  getDescription(): string {
    return "Alternates between GPT-5 and Claude-Sonnet-4.5 on each call";
  }

  reset(): void {
    this.currentIndex = 0;
  }
}

/**
 * Smart strategy: selects model based on task type
 */
export class SmartStrategy implements ModelStrategy {
  private lastModel: ModelIdentifier = "Claude-Sonnet-4.5";

  getNextModel(context?: ModelContext): ModelIdentifier {
    if (!context) {
      return "Claude-Sonnet-4.5";
    }

    // Smart selection based on context
    if (context.messageType === "code" || context.messageType === "reasoning") {
      // Use GPT-5 for complex coding and reasoning tasks
      if (context.complexity === "complex") {
        this.lastModel = "GPT-5";
        return "GPT-5";
      }
      // Use Claude for medium complexity code
      this.lastModel = "Claude-Sonnet-4.5";
      return "Claude-Sonnet-4.5";
    }

    if (context.messageType === "chat") {
      // Use GPT-4o for general chat
      this.lastModel = "GPT-4o";
      return "GPT-4o";
    }

    // Default to Claude
    this.lastModel = "Claude-Sonnet-4.5";
    return "Claude-Sonnet-4.5";
  }

  getName(): string {
    return "smart";
  }

  getDescription(): string {
    return "Intelligently selects model based on task complexity and type";
  }

  reset(): void {
    this.lastModel = "Claude-Sonnet-4.5";
  }
}

/**
 * Fixed strategy: always uses the same model
 */
export class FixedStrategy implements ModelStrategy {
  constructor(private model: ModelIdentifier = "Claude-Sonnet-4.5") {}

  getNextModel(): ModelIdentifier {
    return this.model;
  }

  setModel(model: ModelIdentifier): void {
    this.model = model;
  }

  getName(): string {
    return "fixed";
  }

  getDescription(): string {
    return `Always uses ${this.model}`;
  }

  reset(): void {
    // No state to reset
  }
}

/**
 * Round-robin strategy: cycles through all available models
 */
export class RoundRobinStrategy implements ModelStrategy {
  private currentIndex = 0;
  private models: ModelIdentifier[];

  constructor(models?: ModelIdentifier[]) {
    this.models = models || [...AVAILABLE_MODELS];
  }

  getNextModel(): ModelIdentifier {
    const model = this.models[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.models.length;
    return model;
  }

  getName(): string {
    return "round-robin";
  }

  getDescription(): string {
    return `Cycles through: ${this.models.join(", ")}`;
  }

  reset(): void {
    this.currentIndex = 0;
  }
}

/**
 * Factory for creating model strategies
 */
export class ModelStrategyFactory {
  static createStrategy(config: StrategyConfig): ModelStrategy {
    switch (config.type) {
      case "mixed":
        return new MixedStrategy();
      case "smart":
        return new SmartStrategy();
      case "fixed":
        return new FixedStrategy(config.fixedModel);
      case "round-robin":
        return new RoundRobinStrategy(config.customOrder);
      default:
        return new MixedStrategy();
    }
  }

  static getAvailableStrategies(): Array<{
    type: StrategyType;
    description: string;
  }> {
    return [
      { type: "mixed", description: "Alternate between GPT-5 and Claude-Sonnet-4.5" },
      { type: "smart", description: "Intelligently select based on task type" },
      { type: "fixed", description: "Always use the same model" },
      { type: "round-robin", description: "Cycle through all available models" },
    ];
  }
}

/**
 * Manager for persisting and loading strategy configuration
 */
export class StrategyConfigManager {
  private static CONFIG_DIR = path.join(os.homedir(), ".poe-setup");
  private static CONFIG_FILE = path.join(
    StrategyConfigManager.CONFIG_DIR,
    "strategy-config.json"
  );

  static saveConfig(config: StrategyConfig): void {
    if (!fs.existsSync(this.CONFIG_DIR)) {
      fs.mkdirSync(this.CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(this.CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  static loadConfig(): StrategyConfig | null {
    try {
      if (fs.existsSync(this.CONFIG_FILE)) {
        const data = fs.readFileSync(this.CONFIG_FILE, "utf-8");
        return JSON.parse(data) as StrategyConfig;
      }
    } catch (error) {
      console.error("Failed to load strategy config:", error);
    }
    return null;
  }

  static getDefaultConfig(): StrategyConfig {
    return {
      type: "fixed",
      fixedModel: "Claude-Sonnet-4.5",
    };
  }
}
