import path from "node:path";
import type { CliEnvironment } from "../cli/environment.js";
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
  env: CliEnvironment;
}

interface TransformResult {
  content: string | null;
  changed: boolean;
}

interface TransformFileMutation<Options> {
  kind: "transformFile";
  label?: ValueResolver<Options, string | undefined>;
  target: ValueResolver<Options, string>;
  transform(
    input: { content: string | null; context: MutationContext<Options> }
  ): Promise<TransformResult> | TransformResult;
}

interface EnsureDirectoryMutation<Options> {
  kind: "ensureDirectory";
  label?: ValueResolver<Options, string | undefined>;
  path: ValueResolver<Options, string>;
}

interface CreateBackupMutation<Options> {
  kind: "createBackup";
  label?: ValueResolver<Options, string | undefined>;
  target: ValueResolver<Options, string>;
  timestamp?: ValueResolver<Options, (() => string) | undefined>;
}

interface WriteTemplateMutation<Options> {
  kind: "writeTemplate";
  label?: ValueResolver<Options, string | undefined>;
  target: ValueResolver<Options, string>;
  templateId: string;
  context?: ValueResolver<Options, JsonObject | undefined>;
}

interface RemoveFileMutation<Options> {
  kind: "removeFile";
  label?: ValueResolver<Options, string | undefined>;
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

interface ServiceManifestDefinition<
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
  configureMutations: ServiceMutation<ConfigureOptions>[];
  removeMutations?: ServiceMutation<RemoveOptions>[];
  configure(
    context: ServiceExecutionContext<ConfigureOptions>,
    runOptions?: ServiceRunOptions
  ): Promise<void>;
  remove: (
    context: ServiceExecutionContext<RemoveOptions>,
    runOptions?: ServiceRunOptions
  ) => Promise<boolean>;
}

export interface ServiceExecutionContext<Options> {
  fs: FileSystem;
  env: CliEnvironment;
  options: Options;
}

export interface MutationLogDetails {
  manifestId: string;
  kind: ServiceMutationKind;
  label: string;
  targetPath?: string;
}

export type MutationDetail =
  | "create"
  | "update"
  | "delete"
  | "noop"
  | "backup";

export interface ServiceMutationOutcome {
  changed: boolean;
  effect: MutationEffect;
  detail?: MutationDetail;
}

export type MutationEffect =
  | "none"
  | "mkdir"
  | "copy"
  | "write"
  | "delete";

export interface ServiceMutationHooks {
  onStart?(details: MutationLogDetails): void;
  onComplete?(
    details: MutationLogDetails,
    outcome: ServiceMutationOutcome
  ): void;
  onError?(details: MutationLogDetails, error: unknown): void;
}

export function ensureDirectory<Options>(config: {
  path: ValueResolver<Options, string>;
  label?: ValueResolver<Options, string | undefined>;
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
  label?: ValueResolver<Options, string | undefined>;
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
  label?: ValueResolver<Options, string | undefined>;
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
  label?: ValueResolver<Options, string | undefined>;
}): ServiceMutation<Options> {
  return {
    kind: "transformFile",
    target: config.target,
    label: config.label,
    async transform({ content, context }) {
      const rawTarget = resolveValue(config.target, context);
      const targetPath = expandHomeShortcut(rawTarget, context.env);
      const current = await parseJsonWithRecovery({
        content,
        fs: context.fs,
        targetPath
      });
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
  label?: ValueResolver<Options, string | undefined>;
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
  label?: ValueResolver<Options, string | undefined>;
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
  label?: ValueResolver<Options, string | undefined>;
}): ServiceMutation<Options> {
  return {
    kind: "removeFile",
    target: config.target,
    whenEmpty: config.whenEmpty,
    whenContentMatches: config.whenContentMatches,
    label: config.label
  };
}

export function createServiceManifest<
  ConfigureOptions,
  RemoveOptions = ConfigureOptions
>(definition: ServiceManifestDefinition<ConfigureOptions, RemoveOptions>): ServiceManifest<ConfigureOptions, RemoveOptions> {
  const configureMutations = definition.configure;
  const removeMutations = definition.remove;

  return {
    id: definition.id,
    summary: definition.summary,
    prerequisites: definition.prerequisites,
    configureMutations,
    removeMutations,
    async configure(context, runOptions) {
      await runMutations(configureMutations, context, {
        trackChanges: false,
        hooks: runOptions?.hooks,
        manifestId: definition.id
      });
    },
    async remove(context, runOptions) {
      if (!removeMutations) {
        return false;
      }
      return runMutations(removeMutations, context, {
        trackChanges: true,
        hooks: runOptions?.hooks,
        manifestId: definition.id
      });
    }
  };
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
      const targetPath = resolvePath(mutation.path, context);
      const details = createMutationDetails(
        mutation,
        manifestId,
        targetPath,
        context
      );
      hooks?.onStart?.(details);
      try {
        const existed = await pathExists(context.fs, targetPath);
        await context.fs.mkdir(targetPath, { recursive: true });
        hooks?.onComplete?.(details, {
          changed: !existed,
          effect: "mkdir",
          detail: existed ? "noop" : "create"
        });
        return !existed;
      } catch (error) {
        hooks?.onError?.(details, error);
        throw error;
      }
    }
    case "createBackup": {
      const targetPath = resolvePath(mutation.target, context);
      const timestamp = mutation.timestamp
        ? resolveValue(mutation.timestamp, mutationContext(context))
        : undefined;
      const details = createMutationDetails(
        mutation,
        manifestId,
        targetPath,
        context
      );
      hooks?.onStart?.(details);
      try {
        const backupPath = await createBackup(context.fs, targetPath, timestamp);
        hooks?.onComplete?.(details, {
          changed: backupPath != null,
          effect: backupPath ? "copy" : "none",
          detail: backupPath ? "backup" : "noop"
        });
      } catch (error) {
        hooks?.onError?.(details, error);
        throw error;
      }
      return false;
    }
    case "writeTemplate": {
      const targetPath = resolvePath(mutation.target, context);
      const renderContext = mutation.context
        ? resolveValue(mutation.context, mutationContext(context))
        : undefined;
      const rendered = await renderTemplate(
        mutation.templateId,
        renderContext ?? {}
      );
      const details = createMutationDetails(
        mutation,
        manifestId,
        targetPath,
        context
      );
      hooks?.onStart?.(details);
      try {
        const existed = await pathExists(context.fs, targetPath);
        await context.fs.writeFile(targetPath, rendered, { encoding: "utf8" });
        hooks?.onComplete?.(details, {
          changed: true,
          effect: "write",
          detail: existed ? "update" : "create"
        });
      } catch (error) {
        hooks?.onError?.(details, error);
        throw error;
      }
      return true;
    }
    case "removeFile": {
      const targetPath = resolvePath(mutation.target, context);
      const details = createMutationDetails(
        mutation,
        manifestId,
        targetPath,
        context
      );
      hooks?.onStart?.(details);
      try {
        const raw = await context.fs.readFile(targetPath, "utf8");
        const trimmed = raw.trim();
        if (
          mutation.whenContentMatches &&
          !mutation.whenContentMatches.test(trimmed)
        ) {
          hooks?.onComplete?.(details, {
            changed: false,
            effect: "none",
            detail: "noop"
          });
          return false;
        }
        if (mutation.whenEmpty && trimmed.length > 0) {
          hooks?.onComplete?.(details, {
            changed: false,
            effect: "none",
            detail: "noop"
          });
          return false;
        }
        await context.fs.unlink(targetPath);
        hooks?.onComplete?.(details, {
          changed: true,
          effect: "delete",
          detail: "delete"
        });
        return true;
      } catch (error) {
        if (isNotFound(error)) {
          hooks?.onComplete?.(details, {
            changed: false,
            effect: "none",
            detail: "noop"
          });
          return false;
        }
        hooks?.onError?.(details, error);
        throw error;
      }
    }
    case "transformFile": {
      const targetPath = resolvePath(mutation.target, context);
      const current = await readFileIfExists(context.fs, targetPath);
      const details = createMutationDetails(
        mutation,
        manifestId,
        targetPath,
        context
      );
      hooks?.onStart?.(details);
      try {
        const result = await mutation.transform({
          content: current,
          context: mutationContext(context)
        });
        const transformOutcome = await persistTransformResult({
          fs: context.fs,
          targetPath,
          previousContent: current,
          result
        });
        hooks?.onComplete?.(details, transformOutcome);
        return transformOutcome.changed;
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
    options: context.options,
    env: context.env
  };
}

function createMutationDetails<Options>(
  mutation: ServiceMutation<Options>,
  manifestId: string,
  targetPath: string | undefined,
  context: ServiceExecutionContext<Options>
): MutationLogDetails {
  const customLabel =
    mutation.label != null
      ? resolveValue(mutation.label, mutationContext(context))
      : undefined;
  const label =
    customLabel ?? describeMutationOperation(mutation.kind, targetPath);

  return {
    manifestId,
    kind: mutation.kind,
    label,
    targetPath
  };
}

function describeMutationOperation(
  kind: ServiceMutationKind,
  targetPath?: string
): string {
  const displayPath = targetPath ?? "target";
  switch (kind) {
    case "ensureDirectory":
      return `Ensure directory ${displayPath}`;
    case "createBackup":
      return `Create backup ${displayPath}`;
    case "writeTemplate":
      return `Write file ${displayPath}`;
    case "removeFile":
      return `Remove file ${displayPath}`;
    case "transformFile":
      return `Transform file ${displayPath}`;
    default:
      return "Operation";
  }
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

function resolvePath<Options>(
  resolver: ValueResolver<Options, string>,
  context: ServiceExecutionContext<Options>
): string {
  const raw = resolveValue(resolver, mutationContext(context));
  return expandHomeShortcut(raw, context.env);
}

function expandHomeShortcut(
  targetPath: string,
  env?: CliEnvironment
): string {
  if (!targetPath?.startsWith("~")) {
    return targetPath;
  }
  if (targetPath.startsWith("~./")) {
    targetPath = `~/.${targetPath.slice(3)}`;
  }
  const homeDir = env?.homeDir ?? process.env.HOME ?? process.env.USERPROFILE;
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

async function parseJsonWithRecovery(input: {
  content: string | null;
  fs: FileSystem;
  targetPath: string;
}): Promise<JsonObject> {
  try {
    return parseJson(input.content);
  } catch {
    await backupInvalidJsonDocument(input);
    return {};
  }
}

async function backupInvalidJsonDocument(input: {
  content: string | null;
  fs: FileSystem;
  targetPath: string;
}): Promise<void> {
  if (input.content == null) {
    return;
  }
  const backupPath = createInvalidDocumentBackupPath(input.targetPath);
  await input.fs.writeFile(backupPath, input.content, { encoding: "utf8" });
}

function createInvalidDocumentBackupPath(targetPath: string): string {
  return `${targetPath}.invalid-${createTimestamp()}.json`;
}

function createTimestamp(): string {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
}

function serializeJson(value: JsonObject): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function persistTransformResult(input: {
  fs: FileSystem;
  targetPath: string;
  previousContent: string | null;
  result: TransformResult;
}): Promise<ServiceMutationOutcome> {
  if (!input.result.changed) {
    return { changed: false, effect: "none", detail: "noop" };
  }
  if (input.result.content == null) {
    if (input.previousContent == null) {
      return { changed: false, effect: "none", detail: "noop" };
    }
    await input.fs.unlink(input.targetPath);
    return { changed: true, effect: "delete", detail: "delete" };
  }
  await input.fs.writeFile(input.targetPath, input.result.content, {
    encoding: "utf8"
  });
  return {
    changed: true,
    effect: "write",
    detail: input.previousContent == null ? "create" : "update"
  };
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

async function pathExists(fs: FileSystem, target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
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
