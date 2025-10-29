import { promises as fs } from "node:fs";
import path from "node:path";

export interface ProviderSetting {
  id: string;
  label: string;
}

interface ManifestFile {
  services?: Array<{ id?: string; label?: string }>;
}

export async function loadProviderSettings(
  rootPath: string
): Promise<ProviderSetting[]> {
  const manifestPath = path.join(rootPath, "dist", "services", "manifest.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as ManifestFile;
    if (!manifest.services) {
      return [];
    }
    return manifest.services
      .filter(
        (service): service is { id: string; label: string } =>
          typeof service.id === "string" && typeof service.label === "string"
      )
      .map((service) => ({ id: service.id, label: service.label }));
  } catch {
    return [];
  }
}

