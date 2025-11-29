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

export function registerTestCommand(
  program: Command,
  container: CliContainer
): Command {
  return program
    .command("test")
    .description("Run service health checks.")
    .argument(
      "[service]",
      "Service to test (claude-code | codex | opencode)"
    )
    .action(async (service: string | undefined) => {
      const resolved = await resolveServiceArgument(
        program,
        container,
        service
      );
      await executeTest(program, container, resolved);
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

  await container.registry.invoke(service, "test", async (entry) => {
    if (!entry.test) {
      throw new Error(`Service "${service}" does not support test.`);
    }
    const resolution = await resolveProviderHandler(entry, providerContext);
    if (!resolution.adapter.test) {
      throw new Error(`Service "${service}" does not support test.`);
    }
    await resolution.adapter.test(providerContext);
  });

  const dryMessage =
    service === "claude-code"
      ? `${adapter.label} test (dry run)`
      : `Dry run: would test ${adapter.label}.`;

  resources.context.complete({
    success: `Tested ${adapter.label}.`,
    dry: dryMessage
  });
}
