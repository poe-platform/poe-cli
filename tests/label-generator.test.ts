import { describe, it, expect } from "vitest";
import type { ProviderAdapter } from "../src/cli/service-registry.js";
import {
  collectSpawnLabels,
  normalizeColor,
  renderLabelDocument
} from "../src/tools/label-generator.js";

function createAdapter(
  overrides: Partial<ProviderAdapter> & Pick<ProviderAdapter, "name" | "label">
): ProviderAdapter {
  return {
    name: overrides.name,
    label: overrides.label,
    resolvePaths: overrides.resolvePaths ?? (() => ({})),
    supportsSpawn: overrides.supportsSpawn,
    branding: overrides.branding,
    install: overrides.install,
    configure: overrides.configure,
    remove: overrides.remove,
    spawn: overrides.spawn
  };
}

describe("label generator", () => {
  it("collects spawn labels and normalizes colors", () => {
    const providers: ProviderAdapter[] = [
      createAdapter({
        name: "alpha",
        label: "Alpha",
        supportsSpawn: true,
        branding: { colors: { light: "#abc123" } }
      }),
      createAdapter({
        name: "beta",
        label: "Beta",
        supportsSpawn: false,
        branding: { colors: { light: "#ffffff" } }
      })
    ];

    const labels = collectSpawnLabels(providers);
    expect(labels).toEqual([
      {
        service: "alpha",
        displayName: "Alpha",
        label: "agent:alpha",
        color: "ABC123",
        description: "Alpha automation label"
      }
    ]);
  });

  it("renders markdown document with workflow JSON", () => {
    const markdown = renderLabelDocument([
      {
        service: "alpha",
        displayName: "Alpha",
        label: "agent:alpha",
        color: "ABC123",
        description: "Alpha automation label"
      }
    ]);
    expect(markdown).toContain("agent:alpha");
    expect(markdown).toContain('"color": "ABC123"');
    expect(markdown).toContain("| Alpha | `agent:alpha` | `#ABC123` |");
  });

  it("normalizes invalid color inputs", () => {
    expect(normalizeColor("")).toBe("000000");
    expect(normalizeColor("#12")).toBe("120000");
    expect(normalizeColor("g!#hijk")).toBe("000000");
  });
});
