import type { FileSystem } from "../utils/file-system.js";
import { createBackup } from "../utils/backup.js";
import { renderTemplate } from "../utils/templates.js";
import {
  deepMergeJson,
  isJsonObject,
  pruneJsonByShape,
  type JsonObject
} from "../utils/json.js";

type ValueResolver<Options, Value> =
  | Value
  | ((context: MutationContext<Options>) => Value);

interface MutationContext<Options> {
  options: Options;
  fs: FileSystem;
}

interface TransformResult {
  content: string | null;
  changed: boolean;
}

interface TransformFileMutation<Options> {
  kind: "transformFile";
  label?: string;
  target: ValueResolver<Options, string>;
  transform(
    input: { content: string | null; context: MutationContext<Options> }
  ): Promise<TransformResult> | TransformResult;
}

interface EnsureDirectoryMutation<Options> {
  kind: "ensureDirectory";
  label?: string;
  path: ValueResolver<Options, string>;
}

interface CreateBackupMutation<Options> {
  kind: "createBackup";
  label?: string;
  target: ValueResolver<Options, string>;
  timestamp?: ValueResolver<Options, (() => string) | undefined>;
}

interface WriteTemplateMutation<Options> {
  kind: "writeTemplate";
  label?: string;
  target: ValueResolver<Options, string>;
  templateId: string;
  context?: ValueResolver<Options, JsonObject | undefined>;
}

interface RemoveFileMutation<Options> {
  kind: "removeFile";
  label?: string;
  target: ValueResolver<Options, string>;
  whenEmpty?: boolean;
  whenContentMatches?: RegExp;
}

export type ServiceMutation<Options> =
  | TransformFileMutation<Options>
  | EnsureDirectoryMutation<Options>
  | CreateBackupMutation<Options>
  | WriteTemplateMutation<Options>
  | RemoveFileMutation<Options>;

export interface ServiceManifest<
  ConfigureOptions,
  RemoveOptions = ConfigureOptions
> {
  id: string;
  summary: string;
  prerequisites?: {
    before?: string[];
    after?: string[];
  };
  configure: ServiceMutation<ConfigureOptions>[];
  remove?: ServiceMutation<RemoveOptions>[];
}

export interface ServiceExecutionContext<Options> {
  fs: FileSystem;
  options: Options;
}

export interface MutationLogDetails {
  manifestId: string;
  kind: ServiceMutationKind;
  label: string;
  targetPath?: string;
}

export interface ServiceMutationHooks {
  onStart?(details: MutationLogDetails): void;
  onComplete?(details: MutationLogDetails, outcome: { changed: boolean }): void;
  onError?(details: MutationLogDetails, error: unknown): void;
}

export function ensureDirectory<Options>(config: {
  path: ValueResolver<Options, string>;
  label?: string;
}): ServiceMutation<Options> {
  return {
    kind: "ensureDirectory",
    path: config.path,
    label: config.label
  };
}

export function createBackupMutation<Options>(config: {
  target: ValueResolver<Options, string>;
  timestamp?: ValueResolver<Options, (() => string) | undefined>;
  label?: string;
}): ServiceMutation<Options> {
  return {
    kind: "createBackup",
    target: config.target,
    timestamp: config.timestamp,
    label: config.label
  };
}

export function writeTemplateMutation<Options>(config: {
  target: ValueResolver<Options, string>;
  templateId: string;
  context?: ValueResolver<Options, JsonObject | undefined>;
  label?: string;
}): ServiceMutation<Options> {
  return {
    kind: "writeTemplate",
    target: config.target,
    templateId: config.templateId,
    context: config.context,
    label: config.label
  };
}

export function jsonMergeMutation<Options>(config: {
  target: ValueResolver<Options, string>;
  value: ValueResolver<Options, JsonObject>;
  label?: string;
}): ServiceMutation<Options> {
  return {
    kind: "transformFile",
    target: config.target,
    label: config.label,
    async transform({ content, context }) {
      const current = parseJson(content);
      const desired = resolveValue(config.value, context);
      const merged = deepMergeJson(current, desired);
      const serialized = serializeJson(merged);
      return {
        content: serialized,
        changed: serialized !== content
      };
    }
  };
}

export function jsonPruneMutation<Options>(config: {
  target: ValueResolver<Options, string>;
  shape: ValueResolver<Options, JsonObject>;
  label?: string;
}): ServiceMutation<Options> {
  return {
    kind: "transformFile",
    target: config.target,
    label: config.label,
    async transform({ content, context }) {
      if (content == null) {
        return { content: null, changed: false };
      }
      const current = parseJson(content);
      const shape = resolveValue(config.shape, context);
      const { changed, result } = pruneJsonByShape(current, shape);
      if (!changed) {
        return { content, changed: false };
      }
      if (Object.keys(result).length === 0) {
        return { content: null, changed: true };
      }
      const serialized = serializeJson(result);
      return {
        content: serialized,
        changed: serialized !== content
      };
    }
  };
}

export function removePatternMutation<Options>(config: {
  target: ValueResolver<Options, string>;
  pattern: RegExp;
  replacement?:
    | string
    | ((
        match: string,
        context: MutationContext<Options>
      ) => string);
  label?: string;
}): ServiceMutation<Options> {
  return {
    kind: "transformFile",
    target: config.target,
    label: config.label,
    transform({ content, context }) {
      if (content == null) {
        return { content: null, changed: false };
      }
      let next: string;
      if (typeof config.replacement === "function") {
        const replacementFn = config.replacement;
        const replacer = (match: string, ..._args: any[]) =>
          replacementFn(match, context);
        next = content.replace(config.pattern, replacer);
      } else {
        next = content.replace(config.pattern, config.replacement ?? "");
      }
      return {
        content: next,
        changed: next !== content
      };
    }
  };
}

export function removeFileMutation<Options>(config: {
  target: ValueResolver<Options, string>;
  whenEmpty?: boolean;
  whenContentMatches?: RegExp;
  label?: string;
}): ServiceMutation<Options> {
  return {
    kind: "removeFile",
    target: config.target,
    whenEmpty: config.whenEmpty,
    whenContentMatches: config.whenContentMatches,
    label: config.label
  };
}

export async function runServiceConfigure<
  ConfigureOptions,
  RemoveOptions = ConfigureOptions
>(
  manifest: ServiceManifest<ConfigureOptions, RemoveOptions>,
  context: ServiceExecutionContext<ConfigureOptions>,
  runOptions?: ServiceRunOptions
): Promise<void> {
  await runMutations(manifest.configure, context, {
    trackChanges: false,
    hooks: runOptions?.hooks,
    manifestId: manifest.id
  });
}

export async function runServiceRemove<
  ConfigureOptions,
  RemoveOptions = ConfigureOptions
>(
  manifest: ServiceManifest<ConfigureOptions, RemoveOptions>,
  context: ServiceExecutionContext<RemoveOptions>,
  runOptions?: ServiceRunOptions
): Promise<boolean> {
  return runMutations(manifest.remove ?? [], context, {
    trackChanges: true,
    hooks: runOptions?.hooks,
    manifestId: manifest.id
  });
}

async function runMutations<Options>(
  mutations: ServiceMutation<Options>[],
  context: ServiceExecutionContext<Options>,
  options: {
    trackChanges: boolean;
    hooks?: ServiceMutationHooks;
    manifestId: string;
  }
): Promise<boolean> {
  let touched = false;
  for (const mutation of mutations) {
    const changed = await applyMutation(
      mutation,
      context,
      options.manifestId,
      options.hooks
    );
    if (options.trackChanges && changed) {
      touched = true;
    }
  }
  return touched;
}

async function applyMutation<Options>(
  mutation: ServiceMutation<Options>,
  context: ServiceExecutionContext<Options>,
  manifestId: string,
  hooks?: ServiceMutationHooks
): Promise<boolean> {
  switch (mutation.kind) {
    case "ensureDirectory": {
      const targetPath = resolveValue(mutation.path, mutationContext(context));
      const details = createMutationDetails(mutation, manifestId, targetPath);
      hooks?.onStart?.(details);
      try {
        await context.fs.mkdir(targetPath, { recursive: true });
        hooks?.onComplete?.(details, { changed: false });
      } catch (error) {
        hooks?.onError?.(details, error);
        throw error;
      }
      return false;
    }
    case "createBackup": {
      const targetPath = resolveValue(mutation.target, mutationContext(context));
      const timestamp = mutation.timestamp
        ? resolveValue(mutation.timestamp, mutationContext(context))
        : undefined;
      const details = createMutationDetails(mutation, manifestId, targetPath);
      hooks?.onStart?.(details);
      try {
        const backupPath = await createBackup(context.fs, targetPath, timestamp);
        hooks?.onComplete?.(details, { changed: backupPath != null });
      } catch (error) {
        hooks?.onError?.(details, error);
        throw error;
      }
      return false;
    }
    case "writeTemplate": {
      const targetPath = resolveValue(mutation.target, mutationContext(context));
      const renderContext = mutation.context
        ? resolveValue(mutation.context, mutationContext(context))
        : undefined;
      const rendered = await renderTemplate(
        mutation.templateId,
        renderContext ?? {}
      );
      const details = createMutationDetails(mutation, manifestId, targetPath);
      hooks?.onStart?.(details);
      try {
        await context.fs.writeFile(targetPath, rendered, { encoding: "utf8" });
        hooks?.onComplete?.(details, { changed: true });
      } catch (error) {
        hooks?.onError?.(details, error);
        throw error;
      }
      return true;
    }
    case "removeFile": {
      const targetPath = resolveValue(mutation.target, mutationContext(context));
      const details = createMutationDetails(mutation, manifestId, targetPath);
      hooks?.onStart?.(details);
      try {
        const raw = await context.fs.readFile(targetPath, "utf8");
        const trimmed = raw.trim();
        if (
          mutation.whenContentMatches &&
          !mutation.whenContentMatches.test(trimmed)
        ) {
          hooks?.onComplete?.(details, { changed: false });
          return false;
        }
        if (mutation.whenEmpty && trimmed.length > 0) {
          hooks?.onComplete?.(details, { changed: false });
          return false;
        }
        await context.fs.unlink(targetPath);
        hooks?.onComplete?.(details, { changed: true });
        return true;
      } catch (error) {
        if (isNotFound(error)) {
          hooks?.onComplete?.(details, { changed: false });
          return false;
        }
        hooks?.onError?.(details, error);
        throw error;
      }
    }
    case "transformFile": {
      const targetPath = resolveValue(mutation.target, mutationContext(context));
      const current = await readFileIfExists(context.fs, targetPath);
      const details = createMutationDetails(mutation, manifestId, targetPath);
      hooks?.onStart?.(details);
      try {
        const result = await mutation.transform({
          content: current,
          context: mutationContext(context)
        });
        const changed = await persistTransformResult({
          fs: context.fs,
          targetPath,
          previousContent: current,
          result
        });
        hooks?.onComplete?.(details, { changed });
        return changed;
      } catch (error) {
        hooks?.onError?.(details, error);
        throw error;
      }
    }
    default: {
      const neverMutation: never = mutation;
      throw new Error(`Unsupported mutation kind: ${(neverMutation as any).kind}`);
    }
  }
}

function mutationContext<Options>(
  context: ServiceExecutionContext<Options>
): MutationContext<Options> {
  return {
    fs: context.fs,
    options: context.options
  };
}

function createMutationDetails<Options>(
  mutation: ServiceMutation<Options>,
  manifestId: string,
  targetPath?: string
): MutationLogDetails {
  const subject = (() => {
    switch (mutation.kind) {
      case "ensureDirectory":
        return mutation.label ?? "Ensure directory";
      case "createBackup":
        return mutation.label ?? "Create backup";
      case "writeTemplate":
        return (
          mutation.label ??
          `Write template ${mutation.templateId}`
        );
      case "removeFile":
        return mutation.label ?? "Remove file";
      case "transformFile":
        return mutation.label ?? "Transform file";
      default:
        return "Operation";
    }
  })();

  return {
    manifestId,
    kind: mutation.kind,
    label: subject,
    targetPath
  };
}

function resolveValue<Options, Value>(
  resolver: ValueResolver<Options, Value>,
  context: MutationContext<Options>
): Value {
  if (typeof resolver === "function") {
    return (resolver as (ctx: MutationContext<Options>) => Value)(context);
  }
  return resolver;
}

function parseJson(content: string | null): JsonObject {
  if (content == null) {
    return {};
  }
  const parsed = JSON.parse(content);
  if (!isJsonObject(parsed)) {
    throw new Error("Expected JSON object for manifest-managed file.");
  }
  return parsed;
}

function serializeJson(value: JsonObject): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function persistTransformResult(input: {
  fs: FileSystem;
  targetPath: string;
  previousContent: string | null;
  result: TransformResult;
}): Promise<boolean> {
  if (!input.result.changed) {
    return false;
  }
  if (input.result.content == null) {
    if (input.previousContent == null) {
      return false;
    }
    await input.fs.unlink(input.targetPath);
    return true;
  }
  await input.fs.writeFile(input.targetPath, input.result.content, {
    encoding: "utf8"
  });
  return true;
}

async function readFileIfExists(
  fs: FileSystem,
  target: string
): Promise<string | null> {
  try {
    return await fs.readFile(target, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

export interface ServiceRunOptions {
  hooks?: ServiceMutationHooks;
}

export type ServiceMutationKind = ServiceMutation<unknown>["kind"];
