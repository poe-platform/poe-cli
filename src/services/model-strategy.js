"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyConfigManager = exports.ModelStrategyFactory = exports.RoundRobinStrategy = exports.FixedStrategy = exports.SmartStrategy = exports.MixedStrategy = exports.AVAILABLE_MODELS = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
/**
 * Available model identifiers
 */
exports.AVAILABLE_MODELS = [
    "Claude-Sonnet-4.5",
    "GPT-5",
    "GPT-4o",
    "Claude-3.5-Sonnet",
    "GPT-5-Codex",
];
/**
 * Mixed strategy: alternates between GPT-5 and Claude-Sonnet-4.5
 */
class MixedStrategy {
    constructor() {
        this.currentIndex = 0;
        this.models = ["GPT-5", "Claude-Sonnet-4.5"];
    }
    getNextModel() {
        const model = this.models[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.models.length;
        return model;
    }
    getName() {
        return "mixed";
    }
    getDescription() {
        return "Alternates between GPT-5 and Claude-Sonnet-4.5 on each call";
    }
    reset() {
        this.currentIndex = 0;
    }
}
exports.MixedStrategy = MixedStrategy;
/**
 * Smart strategy: selects model based on task type
 */
class SmartStrategy {
    constructor() {
        this.lastModel = "Claude-Sonnet-4.5";
    }
    getNextModel(context) {
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
    getName() {
        return "smart";
    }
    getDescription() {
        return "Intelligently selects model based on task complexity and type";
    }
    reset() {
        this.lastModel = "Claude-Sonnet-4.5";
    }
}
exports.SmartStrategy = SmartStrategy;
/**
 * Fixed strategy: always uses the same model
 */
class FixedStrategy {
    constructor(model = "Claude-Sonnet-4.5") {
        this.model = model;
    }
    getNextModel() {
        return this.model;
    }
    setModel(model) {
        this.model = model;
    }
    getName() {
        return "fixed";
    }
    getDescription() {
        return `Always uses ${this.model}`;
    }
    reset() {
        // No state to reset
    }
}
exports.FixedStrategy = FixedStrategy;
/**
 * Round-robin strategy: cycles through all available models
 */
class RoundRobinStrategy {
    constructor(models) {
        this.currentIndex = 0;
        this.models = models || [...exports.AVAILABLE_MODELS];
    }
    getNextModel() {
        const model = this.models[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.models.length;
        return model;
    }
    getName() {
        return "round-robin";
    }
    getDescription() {
        return `Cycles through: ${this.models.join(", ")}`;
    }
    reset() {
        this.currentIndex = 0;
    }
}
exports.RoundRobinStrategy = RoundRobinStrategy;
/**
 * Factory for creating model strategies
 */
class ModelStrategyFactory {
    static createStrategy(config) {
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
    static getAvailableStrategies() {
        return [
            { type: "mixed", description: "Alternate between GPT-5 and Claude-Sonnet-4.5" },
            { type: "smart", description: "Intelligently select based on task type" },
            { type: "fixed", description: "Always use the same model" },
            { type: "round-robin", description: "Cycle through all available models" },
        ];
    }
}
exports.ModelStrategyFactory = ModelStrategyFactory;
/**
 * Manager for persisting and loading strategy configuration
 */
class StrategyConfigManager {
    static saveConfig(config) {
        if (!fs.existsSync(this.CONFIG_DIR)) {
            fs.mkdirSync(this.CONFIG_DIR, { recursive: true });
        }
        fs.writeFileSync(this.CONFIG_FILE, JSON.stringify(config, null, 2));
    }
    static loadConfig() {
        try {
            if (fs.existsSync(this.CONFIG_FILE)) {
                const data = fs.readFileSync(this.CONFIG_FILE, "utf-8");
                return JSON.parse(data);
            }
        }
        catch (error) {
            console.error("Failed to load strategy config:", error);
        }
        return null;
    }
    static getDefaultConfig() {
        return {
            type: "fixed",
            fixedModel: "Claude-Sonnet-4.5",
        };
    }
}
exports.StrategyConfigManager = StrategyConfigManager;
StrategyConfigManager.CONFIG_DIR = path.join(os.homedir(), ".poe-setup");
StrategyConfigManager.CONFIG_FILE = path.join(StrategyConfigManager.CONFIG_DIR, "strategy-config.json");
//# sourceMappingURL=model-strategy.js.map