import { describe, it, expect, vi } from "vitest";
import {
  createServiceRegistry,
  type ProviderAdapter
} from "../src/cli/service-registry.js";

function createAdapter(name: string, label: string): ProviderAdapter {
  return {
    name,
    label,
    configure: vi.fn(),
    remove: vi.fn()
  };
}

describe("ServiceRegistry", () => {
  it("allows providers to self-register and be retrieved by name", () => {
    const registry = createServiceRegistry();
    const adapter = createAdapter("codex", "Codex");

    registry.register(adapter);

    expect(registry.get("codex")).toBe(adapter);
    expect(registry.list()).toEqual([adapter]);
  });

  it("prevents duplicate provider registrations", () => {
    const registry = createServiceRegistry();
    const adapter = createAdapter("codex", "Codex");

    registry.register(adapter);

    expect(() => registry.register(adapter)).toThrowError(
      /"codex" is already registered/i
    );
  });

  it("throws when trying to resolve an unknown provider", () => {
    const registry = createServiceRegistry();

    expect(() => registry.require("unknown"))
      .toThrowError(/unknown provider "unknown"/i);
  });
});
