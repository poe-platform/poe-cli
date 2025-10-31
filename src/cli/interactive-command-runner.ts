import { Command, CommanderError } from "commander";
import { createProgram, type CliDependencies } from "./program.js";

export interface ParsedInteractiveCommand {
  command: string;
  tokens: string[];
  normalized: string[];
}

export interface InteractiveCommandExecutor {
  identify(input: string): ParsedInteractiveCommand | null;
  execute(
    input: string | ParsedInteractiveCommand
  ): Promise<string | null>;
}

export async function createInteractiveCommandExecutor(
  dependencies: CliDependencies
): Promise<InteractiveCommandExecutor> {
  const outputBuffer: string[] = [];
  const baseLogger = dependencies.logger;
  const logger = (message: string) => {
    outputBuffer.push(message);
    if (baseLogger) {
      baseLogger(message);
    }
  };

  const program = createProgram({
    ...dependencies,
    logger,
    exitOverride: true
  });

  const commandMap = buildCommandMap(program.commands.map((cmd) => cmd));

  const identify = (input: string): ParsedInteractiveCommand | null => {
    const tokens = tokenizeInput(input);
    if (tokens.length === 0) {
      return null;
    }
    const first = tokens[0];
    if (first.toLowerCase() === "help") {
      return {
        command: "help",
        tokens,
        normalized: tokens
      };
    }
    const key = tokens[0];
    const canonical =
      commandMap.get(key) ?? commandMap.get(key.toLowerCase());
    if (!canonical) {
      return null;
    }
    const normalized = normalizeTokens(tokens, canonical);
    return {
      command: canonical,
      tokens,
      normalized
    };
  };

  const execute = async (
    input: string | ParsedInteractiveCommand
  ): Promise<string | null> => {
    const parsed =
      typeof input === "string" ? identify(input) : input;
    if (!parsed) {
      return null;
    }

    outputBuffer.length = 0;

    if (parsed.command === "help") {
      return renderHelp(program, parsed.tokens.slice(1));
    }

    try {
      await program.parseAsync(
        parsed.normalized,
        { from: "user" }
      );
    } catch (error) {
      if (error instanceof CommanderError) {
        if (
          error.code !== "commander.helpDisplayed" &&
          error.message &&
          !outputBuffer.includes(error.message)
        ) {
          outputBuffer.push(error.message);
        }
      } else {
        throw error;
      }
    }

    return outputBuffer.join("\n");
  };

  return { identify, execute };
}

function buildCommandMap(
  commands: Array<{ name(): string; aliases(): string[] }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const command of commands) {
    const canonical = command.name();
    map.set(canonical, canonical);
    map.set(canonical.toLowerCase(), canonical);
    for (const alias of command.aliases()) {
      map.set(alias, canonical);
      map.set(alias.toLowerCase(), canonical);
    }
  }
  return map;
}

function renderHelp(program: Command, topics: string[]): string {
  if (topics.length === 0) {
    return program.helpInformation();
  }

  const [topic, ...rest] = topics;
  if (rest.length > 0) {
    return `Unknown help topic "${topics.join(" ")}".`;
  }

  const command = findCommand(program, topic);
  if (!command) {
    return `Unknown help topic "${topic}".`;
  }

  return command.helpInformation();
}

function findCommand(program: Command, name: string): Command | undefined {
  const direct = program.commands.find((cmd) => cmd.name() === name);
  if (direct) {
    return direct;
  }
  const lower = name.toLowerCase();
  return program.commands.find((cmd) => {
    if (cmd.name().toLowerCase() === lower) {
      return true;
    }
    return cmd.aliases().some((alias) => alias === name || alias.toLowerCase() === lower);
  });
}

function tokenizeInput(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const char of input.trim()) {
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === " " || char === "\t") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  if (quote && tokens.length > 0) {
    // Treat unmatched quotes as literal by restoring the quote.
    const last = tokens.pop() ?? "";
    tokens.push(`${last}${quote}`);
  }
  return tokens;
}

function normalizeTokens(
  tokens: string[],
  canonical: string
): string[] {
  if (tokens.length === 0) {
    return tokens;
  }

  const rest = tokens.slice(1);

  if (canonical === "login" && rest.length > 0 && !rest[0].startsWith("-")) {
    return [canonical, "--api-key", rest.join(" ")];
  }

  if (canonical === "test" && rest.length > 0 && !rest[0].startsWith("-")) {
    return [canonical, "--api-key", rest.join(" ")];
  }

  if (canonical === "init" && rest.length > 0 && !rest[0].startsWith("-")) {
    const [projectName, ...remaining] = rest;
    return [canonical, "--project-name", projectName, ...remaining];
  }

  if (
    canonical === "remove" &&
    rest.length > 1 &&
    !rest.some((token) => token.startsWith("--"))
  ) {
    const [service, ...remaining] = rest;
    if (remaining.length > 0) {
      return [
        canonical,
        service,
        "--config-name",
        remaining.join(" ")
      ];
    }
  }

  return [canonical, ...rest];
}
