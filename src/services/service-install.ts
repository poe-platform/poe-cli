import type { CommandRunner, PrerequisiteContext, PrerequisiteDefinition } from "../utils/prerequisites.js";

export interface InstallContext {
  isDryRun: boolean;
  runCommand: CommandRunner;
  logger: (message: string) => void;
}

export interface InstallCommand {
  id: string;
  description: string;
  command: string;
  args: string[];
}

export interface ServiceInstallDefinition {
  id: string;
  summary: string;
  check: PrerequisiteDefinition;
  steps: InstallCommand[];
  postChecks?: PrerequisiteDefinition[];
  successMessage?: string;
}

export async function runServiceInstall(
  definition: ServiceInstallDefinition,
  context: InstallContext
): Promise<boolean> {
  const checkContext: PrerequisiteContext = {
    isDryRun: context.isDryRun,
    runCommand: context.runCommand
  };

  let needsInstall = false;
  try {
    await definition.check.run(checkContext);
    context.logger(`${definition.summary} already installed.`);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error);
    context.logger(`${definition.summary} not detected: ${detail}`);
    needsInstall = true;
  }

  if (!needsInstall) {
    return false;
  }

  if (context.isDryRun) {
    context.logger(`Dry run: would install ${definition.summary}.`);
    for (const step of definition.steps) {
      context.logger(
        `Dry run: ${step.description} -> ${formatCommand(step.command, step.args)}`
      );
    }
    return true;
  }

  for (const step of definition.steps) {
    context.logger(`${step.description}...`);
    const result = await context.runCommand(step.command, step.args);
    if (result.exitCode !== 0) {
      const stderr = result.stderr.trim();
      const suffix = stderr.length > 0 ? `: ${stderr}` : "";
      throw new Error(
        `${step.description} failed with exit code ${result.exitCode}${suffix}`
      );
    }
  }

  await definition.check.run(checkContext);

  if (definition.postChecks) {
    for (const postCheck of definition.postChecks) {
      await postCheck.run(checkContext);
    }
  }

  context.logger(
    definition.successMessage ?? `${definition.summary} installed.`
  );
  return true;
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}
