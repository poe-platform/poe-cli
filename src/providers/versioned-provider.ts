import type { ProviderContext } from "../cli/service-registry.js";
import { detectBinaryVersion } from "../utils/binary-version.js";

export type ProviderVersionResolver = (
  context: ProviderContext
) => Promise<string | null>;

export function createBinaryVersionResolver(
  binaryName: string
): ProviderVersionResolver {
  return async (context) => {
    const result = await detectBinaryVersion(
      context.command.runCommand,
      binaryName
    );
    context.logger.verbose(
      `Detected ${binaryName} version ${result.version} (raw output: ${result.rawOutput})`
    );
    return result.version;
  };
}
