import type { ProviderContext } from "../cli/service-registry.js";
import { detectBinaryVersion } from "../utils/binary-version.js";

export type ProviderVersionResolver<TPaths> = (
  context: ProviderContext<TPaths>
) => Promise<string | null>;

export function createBinaryVersionResolver(
  binaryName: string
): ProviderVersionResolver<Record<string, string>> {
  return async (context) => {
    const result = await detectBinaryVersion(
      context.command.runCommand,
      binaryName
    );
    return result.version;
  };
}
