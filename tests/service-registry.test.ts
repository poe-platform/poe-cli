import { describe, it, expect } from "vitest";
import {
  createServiceRegistry,
  type ProviderService
} from "../src/cli/service-registry.js";
import { createProviderStub } from "./provider-stub.js";

function createAdapter(name: string, label: string): ProviderService {
  return createProviderStub({
    name,
    label
  });
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
