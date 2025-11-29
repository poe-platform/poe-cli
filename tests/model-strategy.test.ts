import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_CLAUDE_CODE_MODEL,
  DEFAULT_CODEX_MODEL
} from "../src/cli/constants.js";

const CLAUDE_MODEL_SONNET = DEFAULT_CLAUDE_CODE_MODEL;
import {
  MixedStrategy,
  SmartStrategy,
  FixedStrategy,
  RoundRobinStrategy,
  ModelStrategyFactory,
  type ModelContext,
  type StrategyConfig,
} from "../src/services/model-strategy.js";

describe("MixedStrategy", () => {
  let strategy: MixedStrategy;

  beforeEach(() => {
    strategy = new MixedStrategy();
  });

  it(`alternates between GPT-5.1 and ${CLAUDE_MODEL_SONNET}`, () => {
    const model1 = strategy.getNextModel();
    const model2 = strategy.getNextModel();
    const model3 = strategy.getNextModel();
    const model4 = strategy.getNextModel();

    expect(model1).toBe("GPT-5.1");
    expect(model2).toBe(CLAUDE_MODEL_SONNET);
    expect(model3).toBe("GPT-5.1");
    expect(model4).toBe(CLAUDE_MODEL_SONNET);
  });

  it("resets to first model when reset() is called", () => {
    strategy.getNextModel(); // GPT-5.1
    strategy.getNextModel(); // Default Claude model

    strategy.reset();

    const model = strategy.getNextModel();
    expect(model).toBe("GPT-5.1");
  });

  it("returns correct name and description", () => {
    expect(strategy.getName()).toBe("mixed");
    expect(strategy.getDescription()).toContain("Alternates");
  });
});

describe("SmartStrategy", () => {
  let strategy: SmartStrategy;

  beforeEach(() => {
    strategy = new SmartStrategy();
  });

  it("selects GPT-5.1 for complex code tasks", () => {
    const context: ModelContext = {
      messageType: "code",
      complexity: "complex",
    };

    const model = strategy.getNextModel(context);
    expect(model).toBe("GPT-5.1");
  });

  it("selects Claude for medium complexity code tasks", () => {
    const context: ModelContext = {
      messageType: "code",
      complexity: "medium",
    };

    const model = strategy.getNextModel(context);
    expect(model).toBe(CLAUDE_MODEL_SONNET);
  });

  it("selects GPT-5.1 for complex reasoning tasks", () => {
    const context: ModelContext = {
      messageType: "reasoning",
      complexity: "complex",
    };

    const model = strategy.getNextModel(context);
    expect(model).toBe("GPT-5.1");
  });

  it("selects GPT-4o for chat tasks", () => {
    const context: ModelContext = {
      messageType: "chat",
      complexity: "simple",
    };

    const model = strategy.getNextModel(context);
    expect(model).toBe("GPT-4o");
  });

  it("defaults to Claude when no context provided", () => {
    const model = strategy.getNextModel();
    expect(model).toBe(CLAUDE_MODEL_SONNET);
  });

  it("defaults to Claude for general tasks", () => {
    const context: ModelContext = {
      messageType: "general",
      complexity: "medium",
    };

    const model = strategy.getNextModel(context);
    expect(model).toBe(CLAUDE_MODEL_SONNET);
  });

  it("returns correct name and description", () => {
    expect(strategy.getName()).toBe("smart");
    expect(strategy.getDescription()).toContain("Intelligently");
  });
});

describe("FixedStrategy", () => {
  it("always returns the configured model", () => {
    const strategy = new FixedStrategy("GPT-5.1");

    expect(strategy.getNextModel()).toBe("GPT-5.1");
    expect(strategy.getNextModel()).toBe("GPT-5.1");
    expect(strategy.getNextModel()).toBe("GPT-5.1");
  });

  it(`defaults to ${CLAUDE_MODEL_SONNET} when no model specified`, () => {
    const strategy = new FixedStrategy();

    expect(strategy.getNextModel()).toBe(CLAUDE_MODEL_SONNET);
  });

  it("can change the model", () => {
    const strategy = new FixedStrategy("GPT-5.1");

    strategy.setModel("GPT-4o");

    expect(strategy.getNextModel()).toBe("GPT-4o");
  });

  it("returns correct name and description", () => {
    const strategy = new FixedStrategy("GPT-5.1");

    expect(strategy.getName()).toBe("fixed");
    expect(strategy.getDescription()).toContain("GPT-5.1");
  });
});

describe("RoundRobinStrategy", () => {
  it("cycles through all available models by default", () => {
    const strategy = new RoundRobinStrategy();

    const model1 = strategy.getNextModel();
    const model2 = strategy.getNextModel();
    const model3 = strategy.getNextModel();
    const model4 = strategy.getNextModel();
    const model5 = strategy.getNextModel();
    const model6 = strategy.getNextModel(); // Should wrap around

    expect(model1).toBe(CLAUDE_MODEL_SONNET);
    expect(model2).toBe("GPT-5.1");
    expect(model3).toBe("GPT-4o");
    expect(model4).toBe("Claude-3.5-Sonnet");
    expect(model5).toBe(DEFAULT_CODEX_MODEL);
    expect(model6).toBe(CLAUDE_MODEL_SONNET); // Wrapped around
  });

  it("cycles through custom model order", () => {
    const customOrder = ["GPT-5.1", CLAUDE_MODEL_SONNET];
    const strategy = new RoundRobinStrategy(customOrder);

    const model1 = strategy.getNextModel();
    const model2 = strategy.getNextModel();
    const model3 = strategy.getNextModel();

    expect(model1).toBe("GPT-5.1");
    expect(model2).toBe(CLAUDE_MODEL_SONNET);
    expect(model3).toBe("GPT-5.1"); // Wrapped around
  });

  it("resets to first model when reset() is called", () => {
    const customOrder = ["GPT-5.1", CLAUDE_MODEL_SONNET];
    const strategy = new RoundRobinStrategy(customOrder);

    strategy.getNextModel(); // GPT-5.1
    strategy.getNextModel(); // Default Claude model

    strategy.reset();

    const model = strategy.getNextModel();
    expect(model).toBe("GPT-5.1");
  });

  it("returns correct name and description", () => {
    const strategy = new RoundRobinStrategy(["GPT-5.1", CLAUDE_MODEL_SONNET]);

    expect(strategy.getName()).toBe("round-robin");
    expect(strategy.getDescription()).toContain("GPT-5.1");
    expect(strategy.getDescription()).toContain(CLAUDE_MODEL_SONNET);
  });
});

describe("ModelStrategyFactory", () => {
  it("creates MixedStrategy", () => {
    const config: StrategyConfig = { type: "mixed" };
    const strategy = ModelStrategyFactory.createStrategy(config);

    expect(strategy).toBeInstanceOf(MixedStrategy);
    expect(strategy.getName()).toBe("mixed");
  });

  it("creates SmartStrategy", () => {
    const config: StrategyConfig = { type: "smart" };
    const strategy = ModelStrategyFactory.createStrategy(config);

    expect(strategy).toBeInstanceOf(SmartStrategy);
    expect(strategy.getName()).toBe("smart");
  });

  it("creates FixedStrategy with specified model", () => {
    const config: StrategyConfig = {
      type: "fixed",
      fixedModel: "GPT-5.1",
    };
    const strategy = ModelStrategyFactory.createStrategy(config);

    expect(strategy).toBeInstanceOf(FixedStrategy);
    expect(strategy.getNextModel()).toBe("GPT-5.1");
  });

  it("creates RoundRobinStrategy with custom order", () => {
    const config: StrategyConfig = {
      type: "round-robin",
      customOrder: ["GPT-5.1", CLAUDE_MODEL_SONNET],
    };
    const strategy = ModelStrategyFactory.createStrategy(config);

    expect(strategy).toBeInstanceOf(RoundRobinStrategy);
    expect(strategy.getNextModel()).toBe("GPT-5.1");
    expect(strategy.getNextModel()).toBe(CLAUDE_MODEL_SONNET);
  });

  it("lists all available strategies", () => {
    const strategies = ModelStrategyFactory.getAvailableStrategies();

    expect(strategies).toHaveLength(4);
    expect(strategies.map(s => s.type)).toEqual([
      "mixed",
      "smart",
      "fixed",
      "round-robin",
    ]);
  });
});
