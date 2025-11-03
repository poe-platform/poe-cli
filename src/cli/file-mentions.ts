import path from "node:path";
import type { ErrorLogger } from "./error-logger.js";

export interface ResolveFileMentionsDependencies {
  input: string;
  cwd: string;
  readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  errorLogger: Pick<ErrorLogger, "logErrorWithStackTrace">;
}

export interface FileMentionResolution {
  processedInput: string;
  attachments: string[];
  mentions: string[];
}

interface MentionSegment {
  readonly mention: string;
  readonly start: number;
  readonly end: number;
}

const WHITESPACE = new Set([" ", "\n", "\r", "\t"]);

export async function resolveFileMentions(
  dependencies: ResolveFileMentionsDependencies
): Promise<FileMentionResolution> {
  const { input, cwd, readFile, errorLogger } = dependencies;

  const segments = extractMentions(input);
  if (segments.length === 0) {
    return {
      processedInput: input,
      attachments: [],
      mentions: []
    };
  }

  const attachments: string[] = [];
  const resolvedMentions: string[] = [];

  for (const segment of segments) {
    resolvedMentions.push(segment.mention);
    const absolutePath = path.isAbsolute(segment.mention)
      ? segment.mention
      : path.join(cwd, segment.mention);

    try {
      const contents = await readFile(absolutePath, "utf8");
      attachments.push(
        `\n\n--- Content of ${segment.mention} ---\n${contents}\n--- End of ${segment.mention} ---`
      );
    } catch (rawError) {
      const error =
        rawError instanceof Error ? rawError : new Error(String(rawError));
      attachments.push(
        `\n\n[Error reading ${segment.mention}: ${error.message}]`
      );
      errorLogger.logErrorWithStackTrace(error, "interactive file mention", {
        component: "interactive",
        operation: "read file mention",
        mention: segment.mention,
        absolutePath,
        cwd
      });
    }
  }

  const base = removeMentions(input, segments).trim();
  return {
    processedInput: `${base}${attachments.join("")}`,
    attachments,
    mentions: resolvedMentions
  };
}

function extractMentions(value: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let index = 0;

  while (index < value.length) {
    if (value[index] !== "@") {
      index += 1;
      continue;
    }

    const start = index;
    index += 1;
    let cursor = index;

    while (cursor < value.length && !WHITESPACE.has(value[cursor])) {
      cursor += 1;
    }

    const mention = value.slice(index, cursor);
    if (mention.length === 0) {
      continue;
    }

    segments.push({
      mention,
      start,
      end: cursor
    });
    index = cursor;
  }

  return segments;
}

function removeMentions(value: string, segments: MentionSegment[]): string {
  if (segments.length === 0) {
    return value;
  }

  let result = "";
  let cursor = 0;

  for (const segment of segments) {
    if (cursor < segment.start) {
      result += value.slice(cursor, segment.start);
    }
    cursor = segment.end;
  }

  if (cursor < value.length) {
    result += value.slice(cursor);
  }

  return result;
}
