export interface PromptDescriptor<TName extends string = string> {
  readonly name: TName;
  readonly message: string;
  readonly type?: string;
  readonly initial?: string | number;
  readonly choices?: Array<{ title: string; value: string }>;
}

export interface ModelPromptInput {
  label: string;
  defaultValue: string;
  choices: Array<{ title: string; value: string }>;
}

export interface ReasoningPromptInput {
  label: string;
  defaultValue: string;
}

export interface PromptLibrary {
  loginApiKey(): PromptDescriptor<"apiKey">;
  model(input: ModelPromptInput): PromptDescriptor<"model">;
  reasoningEffort(
    input: ReasoningPromptInput
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
    loginApiKey: () =>
      describe({
        name: "apiKey",
        message: "Enter your Poe API key (get one at https://poe.com/api_key)",
        type: "password"
      }),
    model: ({ label, defaultValue, choices }) => {
      const initial = Math.max(
        choices.findIndex((choice) => choice.value === defaultValue),
        0
      );
      return describe({
        name: "model",
        message: label,
        type: "select",
        initial,
        choices
      });
    },
    reasoningEffort: ({ label, defaultValue }) =>
      describe({
        name: "reasoningEffort",
        message: label,
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
