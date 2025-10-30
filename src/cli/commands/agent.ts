import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import { resolveCommandFlags } from "./shared.js";
import { DEFAULT_QUERY_MODEL } from "../constants.js";
import type { AgentToolCallEvent } from "../chat.js";
import type { ScopedLogger } from "../logger.js";

export interface AgentCommandOptions {
  apiKey?: string;
  model?: string;
}

export function registerAgentCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("agent")
    .description("Run a single Poe agent prompt with local tooling support.")
    .argument("<text>", "Prompt text to send to the agent")
    .option("--model <model>", "Model identifier", DEFAULT_QUERY_MODEL)
    .option("--api-key <key>", "Poe API key")
    .action(async (text: string, options: AgentCommandOptions) => {
      const flags = resolveCommandFlags(program);
      const logger = container.loggerFactory.create({
        dryRun: flags.dryRun,
        verbose: flags.verbose,
        scope: "agent"
      });

      const model = options.model ?? DEFAULT_QUERY_MODEL;

      if (flags.dryRun) {
        logger.dryRun(
          `would run agent with model "${model}" and prompt "${text}".`
        );
        return;
      }

      const apiKey = await container.options.resolveApiKey({
        value: options.apiKey,
        dryRun: flags.dryRun
      });

      const session = await container.chatServiceFactory({
        apiKey,
        model,
        cwd: container.env.cwd,
        homeDir: container.env.homeDir,
        fs: container.fs,
        logger: (message) => logger.info(message)
      });

      try {
        if ("setToolCallCallback" in session && session.setToolCallCallback) {
          session.setToolCallCallback((event) => logToolCallEvent(event, logger));
        }
        const response = await session.sendMessage(text);
        const activeModel =
          "getModel" in session && session.getModel
            ? session.getModel()
            : model;
        logger.info(`Agent response (${activeModel}): ${response.content}`);
      } finally {
        if ("dispose" in session && session.dispose) {
          await session.dispose();
        }
      }
    });
}

function logToolCallEvent(
  event: AgentToolCallEvent,
  logger: ScopedLogger
): void {
  const serializedArgs = JSON.stringify(event.args);
  if (event.error) {
    logger.error(`Tool ${event.toolName} failed: ${event.error}`);
    return;
  }
  if (event.result) {
    logger.info(`Tool ${event.toolName} result: ${event.result}`);
    return;
  }
  logger.verbose(`Tool ${event.toolName} invoked with args ${serializedArgs}`);
}
