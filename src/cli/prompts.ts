export interface PromptDescriptor<TName extends string = string> {
  readonly name: TName;
  readonly message: string;
  readonly type?: string;
  readonly initial?: string;
}

export interface PromptLibrary {
  apiKey(): PromptDescriptor<"apiKey">;
  loginApiKey(): PromptDescriptor<"apiKey">;
  model(defaultModel: string): PromptDescriptor<"model">;
  reasoningEffort(
    defaultValue: string
  ): PromptDescriptor<"reasoningEffort">;
  configName(defaultName: string): PromptDescriptor<"configName">;
  serviceSelection(): PromptDescriptor<"serviceSelection"> & { type: "number" };
  queryPrompt(): PromptDescriptor<"prompt">;
}

export function createPromptLibrary(): PromptLibrary {
  const describe = <TName extends string>(
    descriptor: PromptDescriptor<TName>
  ): PromptDescriptor<TName> => descriptor;

  return {
    apiKey: () =>
      describe({
        name: "apiKey",
        message: "POE API key",
        type: "text"
      }),
    loginApiKey: () =>
      describe({
        name: "apiKey",
        message: "Enter your Poe API key (get one at https://poe.com/api_key)",
        type: "password"
      }),
    model: (defaultModel: string) =>
      describe({
        name: "model",
        message: "Model",
        type: "text",
        initial: defaultModel
      }),
    reasoningEffort: (defaultValue: string) =>
      describe({
        name: "reasoningEffort",
        message: "Reasoning effort",
        type: "text",
        initial: defaultValue
      }),
    configName: (defaultName: string) =>
      describe({
        name: "configName",
        message: "Configuration name",
        type: "text",
        initial: defaultName
      }),
    serviceSelection: () => {
      const descriptor: PromptDescriptor<"serviceSelection"> & {
        type: "number";
      } = {
        name: "serviceSelection",
        message: "Enter number that you want to configure",
        type: "number"
      };
      return descriptor;
    },
    queryPrompt: () =>
      describe({
        name: "prompt",
        message: "Prompt",
        type: "text"
      })
  };
}
