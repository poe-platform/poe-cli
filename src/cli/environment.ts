import path from "node:path";

export interface CliEnvironmentInit {
  cwd: string;
  homeDir: string;
  platform?: NodeJS.Platform;
  variables?: Record<string, string | undefined>;
}

export interface CliEnvironment {
  readonly cwd: string;
  readonly homeDir: string;
  readonly platform: NodeJS.Platform;
  readonly credentialsPath: string;
  readonly variables: Record<string, string | undefined>;
  resolveHomePath: (...segments: string[]) => string;
  getVariable: (name: string) => string | undefined;
}

export function createCliEnvironment(init: CliEnvironmentInit): CliEnvironment {
  const platform = init.platform ?? process.platform;
  const variables = init.variables ?? process.env;
  const credentialsPath = resolveCredentialsPath(init.homeDir);

  const resolveHomePath = (...segments: string[]): string =>
    path.join(init.homeDir, ...segments);

  const getVariable = (name: string): string | undefined => variables[name];

  return {
    cwd: init.cwd,
    homeDir: init.homeDir,
    platform,
    credentialsPath,
    variables,
    resolveHomePath,
    getVariable
  };
}

export function resolveCredentialsPath(homeDir: string): string {
  return path.join(homeDir, ".poe-setup", "credentials.json");
}
