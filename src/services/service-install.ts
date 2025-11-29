import type { CommandRunner, HookContext, HookDefinition } from "../utils/hooks.js";

export interface InstallContext {
  isDryRun: boolean;
  runCommand: CommandRunner;
  logger: (message: string) => void;
}

export interface InstallCommand {
  id: string;
  command: string;
  args: string[];
}

export interface ServiceInstallDefinition {
  id: string;
  summary: string;
  check: HookDefinition;
  steps: InstallCommand[];
  postChecks?: HookDefinition[];
  successMessage?: string;
}

export async function runServiceInstall(
  definition: ServiceInstallDefinition,
  context: InstallContext
): Promise<boolean> {
  const checkContext: HookContext = {
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
    logInstallDryRun(definition, context);
    return true;
  }

  for (const step of definition.steps) {
    await runInstallStep(step, context);
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

function describeInstallCommand(step: InstallCommand): string {
  return `[${step.id}] ${formatCommand(step.command, step.args)}`;
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args.map(quoteIfNeeded)].join(" ");
}

function quoteIfNeeded(value: string): string {
  if (value.length === 0) {
    return '""';
  }
  if (value.includes(" ") || value.includes("\t") || value.includes("\n")) {
    return `"${value.replaceAll('"', '\\"')}"`;
  }
  return value;
}

function logInstallDryRun(
  definition: ServiceInstallDefinition,
  context: InstallContext
): void {
  context.logger(`Dry run: would install ${definition.summary}.`);
  for (const step of definition.steps) {
    context.logger(`Dry run: ${describeInstallCommand(step)}`);
  }
}

async function runInstallStep(
  step: InstallCommand,
  context: InstallContext
): Promise<void> {
  context.logger(`Running ${describeInstallCommand(step)}`);
  const result = await context.runCommand(step.command, step.args);
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    const suffix = stderr.length > 0 ? `: ${stderr}` : "";
    throw new Error(
      `${describeInstallCommand(step)} failed with exit code ${result.exitCode}${suffix}`
    );
  }
}
