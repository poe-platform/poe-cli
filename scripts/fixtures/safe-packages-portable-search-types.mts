import {
  agentCommands, createAgentCommands, portableSearchCommands, EreLedger, compileEre, matchEre, createBoundedRegexProvider,
  type AgentCommandsOptions, type BoundedRegexProvider, type PortableSearchOptions, type BoundedRegexProviderOptions,
  type SafeJsModule, type SafeJsRuntime,
} from "@poe-platform/safe-bash";
import type { FileSystem, FsBridgeOptions } from "@poe-platform/safe-fs/core";
import { posixPath as contractPath } from "@poe-platform/safe-bash/contracts";
import { posixPath as indexedPath } from "@poe-platform/safe-bash/contracts/index";
import { posixPath as directPath } from "@poe-platform/safe-bash/contracts/path";

for (const paths of [contractPath, indexedPath, directPath]) {
  const joined: string = paths.join("/workspace", "file.txt");
  const absolute: boolean = paths.isAbsolute(joined);
  void absolute;
}

export function safeJsFilesystemModule(runtime: SafeJsRuntime<unknown>, adapter: FileSystem): SafeJsModule {
  const options: Pick<FsBridgeOptions, "cwd" | "signal"> = {
    cwd: "/workspace", signal: new AbortController().signal,
  };
  const moduleOptions: Parameters<typeof runtime.makeFsModule>[0] = { adapter, ...options };
  runtime.makeFsModule({ adapter });
  return runtime.makeFsModule(moduleOptions);
}

const defaultAgentOptions: AgentCommandsOptions = {};
agentCommands();
agentCommands(defaultAgentOptions);
createAgentCommands(defaultAgentOptions);

export function portablePlugins(provider: BoundedRegexProvider) {
  const options: PortableSearchOptions = {
    provider, regex: { maxWorkers: 1 }, search: { defaultInput: "stdin" }, sed: { maxSteps: 10000 },
  };
  return [portableSearchCommands(options), agentCommands({ regexExecutor: provider, regex: { maxWorkers: 1 } })];
}

const providerOptions: BoundedRegexProviderOptions = {
  maxWorkers: 1, maxPatterns: 8, maxPatternBytes: 1024, maxRows: 16,
  maxInputBytes: 8192, maxResultBytes: 256, maxWork: 100000,
  maxAllocationUnits: 100000, maxStates: 1024,
};
portablePlugins(createBoundedRegexProvider(providerOptions));

const ledger = new EreLedger({ maxExpansionBytes: 4096, maxExpansionFields: 128 });
const signal = new AbortController().signal;
const expression = await compileEre("^x$", ledger, signal);
const result = await matchEre(expression, "x", ledger, signal);
if (!result.matched) throw new Error("Public portable ERE execution failed");
