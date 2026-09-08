import type { VirtualShellPlugin } from "../contracts/index.js";
import { createBoundedRegexProvider } from "../commands/regex-execution/bounded-provider.js";
import { RegexExecutor } from "../commands/regex-execution/portable.js";
import type { BoundedRegexProvider } from "../commands/regex-execution/provider.js";
import { commandExecutor, composeAgentCommands, type AgentCommandsOptions } from "./composition.js";

export interface PortableAgentCommandsOptions extends AgentCommandsOptions {
  readonly provider?: BoundedRegexProvider;
}

export const portableAgentCommandNames: readonly string[] = Object.freeze([
  "true", "false", "echo", "pwd", "basename", "dirname", "printf", "mkdir", "touch",
  "cp", "mv", "rm", "rmdir", "ln", "readlink", "realpath", "ls", "cat", "head", "tail",
  "wc", "tee", "tr", "sort", "uniq", "cut", "grep", "test", "[", "env", "xargs", "find",
  "sed", "awk", "jq", "rg", "base64", "base32", "xxd", "od", "sha256sum", "sha1sum",
  "md5sum", "cksum", "gzip", "gunzip", "zcat", "diff", "patch", "chmod", "stat", "mktemp", "tar",
  "paste", "comm", "join", "tac", "expand", "fold", "strings", "seq", "nl", "rev", "unexpand", "split",
  "date", "sleep", "printenv", "tree", "file", "egrep", "fgrep", "column", "html-to-markdown", "du", "expr", "which", "timeout", "apply_patch",
]);

export function portableAgentCommands(options: PortableAgentCommandsOptions = {}): VirtualShellPlugin {
  const provider = options.provider === undefined ? createBoundedRegexProvider() : options.provider;
  const executor = new RegexExecutor(provider, options.regex);
  const searchExecutor = options.search?.regex === undefined ? executor : new RegexExecutor(provider, options.search.regex);
  let disposal: Promise<void> | undefined;
  return {
    name: "portable-agent-commands",
    setup(host) {
      if (disposal) throw new Error("Portable agent commands are disposed");
      const commands = composeAgentCommands({ ...options, execute: options.execute ?? commandExecutor(name => host.commands.get(name)) }, {
        grep: executor, aliases: executor, expr: executor, search: searchExecutor,
      });
      if (!options.replace) for (const command of commands) {
        if (host.commands.has(command.name)) throw new Error(`Command already registered: ${command.name}`);
      }
      for (const command of commands) host.commands.register(command, { replace: options.replace ?? false });
    },
    dispose() {
      return disposal ??= (async () => {
        const results = await Promise.allSettled([executor.dispose(), ...(executor === searchExecutor ? [] : [searchExecutor.dispose()])]);
        const errors = results.filter(result => result.status === "rejected").map(result => result.reason as unknown);
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, "portable agent regex disposal failed");
      })();
    },
  };
}
