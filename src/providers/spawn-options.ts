export interface SpawnCommandOptions {
  prompt: string;
  args?: string[];
  model?: string;
  cwd?: string;
  useStdin?: boolean;
}

export type ProviderSpawnOptions<
  Extra extends Record<string, unknown> = Record<string, never>
> = SpawnCommandOptions & Extra;

export interface DefaultModelConfigureOptions {
  defaultModel: string;
}

export type EmptyProviderOptions = Record<string, never>;
