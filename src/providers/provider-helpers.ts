import path from "node:path";
import type { ServiceMutation } from "../services/service-manifest.js";

type TargetResolver<Options> =
  | string
  | ((context: { options: Options }) => string);

export function makeExecutableMutation<Options>(config: {
  target: TargetResolver<Options>;
  mode?: number;
}): ServiceMutation<Options> {
  const mode = config.mode ?? 0o700;
  const resolver = toResolver(config.target);
  return {
    kind: "transformFile",
    target: resolver,
    label: (context) => `Make file executable ${resolveTargetPath(resolver, context)}`,
    async transform({ content, context }) {
      if (typeof context.fs.chmod === "function" && content != null) {
        const targetPath = resolveTargetPath(resolver, context);
        await context.fs.chmod(targetPath, mode);
      }
      return { content, changed: false };
    }
  };
}

export function quoteSinglePath(targetPath: string): string {
  const escaped = targetPath.replace(/'/g, `'\\''`);
  return `'${escaped}'`;
}

function toResolver<Options>(
  input: TargetResolver<Options>
): (context: { options: Options }) => string {
  if (typeof input === "function") {
    return input;
  }
  return () => input;
}

function resolveTargetPath<Options>(
  resolver: (context: { options: Options }) => string,
  context: { options: Options } & {
    env?: { homeDir?: string };
  }
): string {
  const raw = resolver(context);
  if (!raw.startsWith("~")) {
    return raw;
  }
  let targetPath = raw;
  if (targetPath.startsWith("~./")) {
    targetPath = `~/.${targetPath.slice(3)}`;
  }
  const homeDir =
    context.env?.homeDir ??
    (context.options as unknown as { env?: { homeDir?: string } }).env?.homeDir ??
    process.env.HOME ??
    process.env.USERPROFILE;
  if (!homeDir) {
    return targetPath;
  }
  let remainder = targetPath.slice(1);
  if (remainder.startsWith("/")) {
    remainder = remainder.slice(1);
  } else if (remainder.startsWith("\\")) {
    remainder = remainder.slice(1);
  } else if (remainder.startsWith(".")) {
    remainder = remainder.slice(1);
    if (remainder.startsWith("/")) {
      remainder = remainder.slice(1);
    } else if (remainder.startsWith("\\")) {
      remainder = remainder.slice(1);
    }
  }
  return remainder.length === 0 ? homeDir : path.join(homeDir, remainder);
}
