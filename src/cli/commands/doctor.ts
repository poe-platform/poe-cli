import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  buildProviderContext,
  createExecutionResources,
  resolveCommandFlags,
  resolveServiceAdapter,
  resolveProviderHandler
} from "./shared.js";
import { loadConfiguredServices } from "../../services/credentials.js";
import { executeConfigure } from "./configure.js";
import { executeRemove } from "./remove.js";
import { ensureIsolatedConfigForService } from "./ensure-isolated-config.js";

export function registerDoctorCommand(
  program: Command,
  container: CliContainer
): Command {
  return program
    .command("doctor")
    .description("Check installed agent versions and refresh outdated configurations.")
    .action(async () => {
      await executeDoctor(program, container);
    });
}

export async function executeDoctor(
  program: Command,
  container: CliContainer
): Promise<void> {
  const flags = resolveCommandFlags(program);

  const configured = await loadConfiguredServices({
    fs: container.fs,
    filePath: container.env.credentialsPath
  });
  const services = Object.entries(configured);
  if (services.length === 0) {
    const logger = container.loggerFactory.create({ scope: "doctor" });
    logger.info("No configured services found to inspect.");
    return;
  }

  for (const [service, metadata] of services) {
    await reconcileService({
      program,
      container,
      service,
      metadata: metadata ?? { version: null, files: [] },
      flags
    });
  }
}

interface DoctorContext {
  program: Command;
  container: CliContainer;
  service: string;
  metadata: { version: string | null };
  flags: ReturnType<typeof resolveCommandFlags>;
}

async function reconcileService(context: DoctorContext): Promise<void> {
  const { program, container, service, metadata, flags } = context;
  let adapter;
  try {
    adapter = resolveServiceAdapter(container, service);
  } catch (error) {
    const logger = container.loggerFactory.create({ scope: `doctor:${service}` });
    logger.warn(`Skipping unknown service "${service}": ${
      error instanceof Error ? error.message : String(error)
    }`);
    return;
  }

  await ensureIsolatedConfigForService({
    container,
    adapter,
    service,
    flags
  });

  const resources = createExecutionResources(
    container,
    flags,
    `doctor:${service}`
  );
  const providerContext = buildProviderContext(
    container,
    adapter,
    resources
  );

  const resolution = await resolveProviderHandler(adapter, providerContext);
  const detectedVersion = resolution.version;
  const storedVersion = metadata.version ?? null;

  if (detectedVersion == null) {
    resources.logger.warn(
      `${adapter.label}: unable to detect CLI version; skipping refresh.`
    );
    return;
  }

  if (!needsRefresh(storedVersion, detectedVersion)) {
    resources.logger.info(
      `${adapter.label} is up to date (version ${detectedVersion}).`
    );
    return;
  }

  if (flags.dryRun) {
    resources.logger.dryRun(
      `Dry run: would refresh ${adapter.label} from ${storedVersion ?? "unknown"} to ${detectedVersion}.`
    );
    return;
  }

  resources.logger.info(
    `Refreshing ${adapter.label} from ${storedVersion ?? "unknown"} to ${detectedVersion}.`
  );
  await executeRemove(program, container, service, {});
  await executeConfigure(program, container, service, {});
}

function needsRefresh(stored: string | null, detected: string | null): boolean {
  if (stored == null && detected == null) {
    return false;
  }
  return stored !== detected;
}
