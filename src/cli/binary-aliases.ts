import type { ProviderService } from "./service-registry.js";

export interface WrapBinaryAlias {
  binName: string;
  serviceName: string;
  agentBinary: string;
}

export function deriveWrapBinaryAliases(
  providers: ProviderService[]
): WrapBinaryAlias[] {
  const aliases: WrapBinaryAlias[] = [];
  const seen = new Set<string>();

  for (const provider of providers) {
    const isolated = provider.isolatedEnv;
    if (!isolated) {
      continue;
    }
    const agentBinary = isolated.agentBinary.trim();
    if (agentBinary.length === 0) {
      throw new Error(`Provider "${provider.name}" defines an empty agentBinary.`);
    }

    const binName = `poe-${agentBinary}`;
    if (seen.has(binName)) {
      throw new Error(`Duplicate wrapper binary name "${binName}".`);
    }
    seen.add(binName);

    aliases.push({
      binName,
      serviceName: provider.name,
      agentBinary
    });
  }

  return aliases.sort((a, b) => a.binName.localeCompare(b.binName));
}

