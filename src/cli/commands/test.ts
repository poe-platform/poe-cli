import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  buildProviderContext,
  createExecutionResources,
  resolveCommandFlags,
  resolveProviderHandler,
  resolveServiceAdapter
} from "./shared.js";
import { resolveServiceArgument } from "./configure.js";
import type { CommandRunnerResult } from "../../utils/command-checks.js";
import {
  formatCommandRunnerResult,
  stdoutMatchesExpected
} from "../../utils/command-checks.js";

export function registerTestCommand(
  program: Command,
  container: CliContainer
): Command {
  return program
    .command("test")
    .description("Run service health checks.")
    .option("--stdin", "Verify stdin prompt support via spawn")
    .argument(
      "[service]",
      "Service to test (claude-code | codex | opencode)"
    )
    .action(async function (this: Command, service: string | undefined) {
      const resolved = await resolveServiceArgument(
        program,
        container,
        service
      );
      await executeTest(this, container, resolved);
    });
}

export async function executeTest(
  program: Command,
  container: CliContainer,
  service: string
): Promise<void> {
  const adapter = resolveServiceAdapter(container, service);
  const flags = resolveCommandFlags(program);
  const resources = createExecutionResources(
    container,
    flags,
    `test:${service}`
  );
  const providerContext = buildProviderContext(
    container,
    adapter,
    resources
  );

  const commandOptions = program.optsWithGlobals<{ stdin?: boolean }>();
  if (commandOptions.stdin) {
    if (!adapter.supportsStdinPrompt) {
      throw new Error(`${adapter.label} does not support stdin prompts.`);
    }

    if (flags.dryRun) {
      resources.context.complete({
        success: `Tested ${adapter.label}.`,
        dry: `Dry run: would run a stdin spawn test for ${adapter.label}.`
      });
      return;
    }

    const expectedOutput = "STDIN_OK";
    const prompt = `Output exactly: ${expectedOutput}`;
    const result = (await container.registry.invoke(
      service,
      "spawn",
      async (entry) => {
        if (!entry.spawn) {
          throw new Error(`Service "${service}" does not support spawn.`);
        }
        const resolution = await resolveProviderHandler(entry, providerContext, {
          useResolver: false
        });
        if (!resolution.adapter.spawn) {
          throw new Error(`Service "${service}" does not support spawn.`);
        }
        const output = await resolution.adapter.spawn(providerContext, {
          prompt,
          useStdin: true
        });
        return output as CommandRunnerResult | void;
      }
    )) as CommandRunnerResult | void;

    if (!result) {
      throw new Error(
        `Stdin spawn test for ${adapter.label} did not return command output.`
      );
    }

    if (result.exitCode !== 0) {
      throw new Error(
        [
          `Stdin spawn test for ${adapter.label} failed with exit code ${result.exitCode}.`,
          formatCommandRunnerResult(result)
        ].join("\n")
      );
    }

    if (!stdoutMatchesExpected(result.stdout, expectedOutput)) {
      throw new Error(
        [
          `Stdin spawn test for ${adapter.label} failed: expected "${expectedOutput}" but received "${result.stdout.trim()}".`,
          formatCommandRunnerResult(result)
        ].join("\n")
      );
    }
  } else {
    await container.registry.invoke(service, "test", async (entry) => {
      if (!entry.test) {
        throw new Error(`Service "${service}" does not support test.`);
      }
      const resolution = await resolveProviderHandler(entry, providerContext, {
        useResolver: false
      });
      if (!resolution.adapter.test) {
        throw new Error(`Service "${service}" does not support test.`);
      }
      await resolution.adapter.test(providerContext);
    });
  }

  const dryMessage =
    service === "claude-code"
      ? `${adapter.label} test (dry run)`
      : `Dry run: would test ${adapter.label}.`;

  resources.context.complete({
    success: `Tested ${adapter.label}.`,
    dry: dryMessage
  });
}
