import type { Command } from "commander";
import type { CliContainer } from "../container.js";
import {
  buildProviderContext,
  type ExecutionResources,
  resolveCommandFlags,
  resolveServiceAdapter
} from "./shared.js";
import { spawnGitWorktree } from "../../commands/spawn-worktree.js";
import { simpleGit as createSimpleGit } from "simple-git";
import type { CommandRunnerResult, CommandRunner } from "../../utils/prerequisites.js";
import type { ProviderAdapter } from "../service-registry.js";

export interface SpawnWorktreeCommandOptions {
  branch?: string;
}

export function registerSpawnWorktreeCommand(
  program: Command,
  container: CliContainer
): void {
  program
    .command("spawn-git-worktree")
    .description(
      "Create a git worktree, run an agent, and attempt to merge changes."
    )
    .argument(
      "<service>",
      "Service to spawn (claude-code | codex | opencode)"
    )
    .argument("<prompt>", "Prompt to provide to the agent")
    .argument("[agentArgs...]", "Additional arguments forwarded to the agent")
    .option("--branch <name>", "Target branch to merge into")
    .action(
      async (
        service: string,
        promptText: string,
        agentArgs: string[] = [],
        options: SpawnWorktreeCommandOptions
      ) => {
        const adapter = resolveServiceAdapter(container, service);
        if (!adapter.supportsSpawn) {
          throw new Error(`${adapter.label} does not support spawn.`);
        }

        const flags = resolveCommandFlags(program);
        const logger = container.loggerFactory.create({
          dryRun: flags.dryRun,
          verbose: flags.verbose,
          scope: "spawn-worktree"
        });

        if (flags.dryRun) {
          const argsSuffix =
            agentArgs.length > 0
              ? ` with args ${JSON.stringify(agentArgs)}`
              : "";
          const branchSuffix = options.branch ? ` into ${options.branch}` : "";
          logger.dryRun(
            `Dry run: would create git worktree, run ${adapter.label}${argsSuffix}, and merge${branchSuffix}.`
          );
          return;
        }

        const runner = flags.verbose
          ? createVerboseRunner(container, logger)
          : container.commandRunner;

        const currentBranch = await resolveTargetBranch(
          container,
          options.branch
        );

        await spawnGitWorktree({
          agent: service,
          prompt: promptText,
          agentArgs,
          basePath: container.env.cwd,
          targetBranch: currentBranch,
          logger: (message) => logger.info(message),
          runAgent: async ({ agent, prompt, args }) => {
            if (agent !== service) {
              throw new Error(
                `Mismatched agent request "${agent}" (expected "${service}").`
              );
            }
            return await spawnWithCustomRunner(
              container,
              adapter,
              flags.verbose,
              runner,
              prompt,
              args
            );
          }
        });
      }
    );
}

function createVerboseRunner(
  container: CliContainer,
  logger: ReturnType<CliContainer["loggerFactory"]["create"]>
): CommandRunner {
  return async (command, args) => {
    logger.verbose(`> ${[command, ...args].join(" ").trim()}`);
    return container.commandRunner(command, args);
  };
}

async function resolveTargetBranch(
  container: CliContainer,
  branchOverride?: string
): Promise<string> {
  if (branchOverride) {
    return branchOverride;
  }
  const git = createSimpleGit({ baseDir: container.env.cwd });
  const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
  return branch.trim();
}

async function spawnWithCustomRunner(
  container: CliContainer,
  adapter: ProviderAdapter,
  verbose: boolean,
  runner: CommandRunner,
  prompt: string,
  args: string[]
): Promise<CommandRunnerResult> {
  const scopedLogger = container.loggerFactory.create({
    dryRun: false,
    verbose,
    scope: `spawn:${adapter.name}`
  });
  const context = container.contextFactory.create({
    dryRun: false,
    logger: scopedLogger,
    runner
  });
  const resources: ExecutionResources = {
    logger: scopedLogger,
    context
  };
  const providerContext = buildProviderContext(
    container,
    adapter,
    resources
  );

  return (await container.registry.invoke(
    adapter.name,
    "spawn",
    async (entry) => {
      if (!entry.spawn) {
        throw new Error(`${adapter.label} does not support spawn.`);
      }
      return (await entry.spawn(providerContext, {
        prompt,
        args
      })) as CommandRunnerResult;
    }
  )) as CommandRunnerResult;
}
