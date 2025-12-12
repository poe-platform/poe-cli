import type { ProviderService } from "../cli/service-registry.js";

export interface WrapperTarget {
  binary: string;
  wrapper: string;
}

export const SERVICE_WRAPPER_TARGETS: Record<string, WrapperTarget> = {
  "claude-code": { binary: "claude", wrapper: "poe-claude" },
  codex: { binary: "codex", wrapper: "poe-codex" },
  opencode: { binary: "opencode", wrapper: "poe-opencode" },
  kimi: { binary: "kimi", wrapper: "poe-kimi" }
};

export function getWrapperByService(
  service: ProviderService
): WrapperTarget | undefined {
  return SERVICE_WRAPPER_TARGETS[service.name];
}

export function getServiceNameForWrapper(wrapperName: string): string | undefined {
  return Object.entries(SERVICE_WRAPPER_TARGETS).find(
    ([, target]) => target.wrapper === wrapperName
  )?.[0];
}

export function getWrapperForServiceName(
  serviceName: string
): WrapperTarget | undefined {
  return SERVICE_WRAPPER_TARGETS[serviceName];
}

export function getWrapperBinaryName(serviceName: string): string | undefined {
  return SERVICE_WRAPPER_TARGETS[serviceName]?.wrapper;
}

export function getNativeBinaryName(serviceName: string): string | undefined {
  return SERVICE_WRAPPER_TARGETS[serviceName]?.binary;
}
