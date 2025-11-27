import type { ServiceMutation } from "../services/service-manifest.js";

export function makeExecutableMutation<Options>(config: {
  target: (context: { options: Options }) => string;
  label: string;
  mode?: number;
}): ServiceMutation<Options> {
  const mode = config.mode ?? 0o700;
  return {
    kind: "transformFile",
    target: config.target,
    label: config.label,
    async transform({ content, context }) {
      if (typeof context.fs.chmod === "function" && content != null) {
        await context.fs.chmod(config.target(context), mode);
      }
      return { content, changed: false };
    }
  };
}

export function quoteSinglePath(targetPath: string): string {
  const escaped = targetPath.replace(/'/g, `'\\''`);
  return `'${escaped}'`;
}
