export interface PromptDescriptor<TName extends string = string> {
  readonly name: TName;
  readonly message: string;
  readonly type?: string;
  readonly initial?: string | number;
  readonly choices?: Array<{ title: string; value: string }>;
}

import { CLAUDE_CODE_MODELS } from "./constants.js";

export interface PromptLibrary {
  apiKey(): PromptDescriptor<"apiKey">;
  loginApiKey(): PromptDescriptor<"apiKey">;
  model(input: {
    defaultValue: string;
    choices: Array<{ title: string; value: string }>;
  }): PromptDescriptor<"model">;
  claudeModel(defaultValue: string): PromptDescriptor<"model">;
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
    model: ({ defaultValue, choices }) => {
      const initial = Math.max(
        choices.findIndex((choice) => choice.value === defaultValue),
        0
      );
      return describe({
        name: "model",
        message: "Model",
        type: "select",
        initial,
        choices
      });
    },
    claudeModel: (defaultValue: string) => {
      const choices = CLAUDE_CODE_MODELS.map((entry) => ({
        title: entry.label,
        value: entry.id
      }));
      const initial = Math.max(
        choices.findIndex((choice) => choice.value === defaultValue),
        0
      );
      return describe({
        name: "model",
        message: "Default Model",
        type: "select",
        initial,
        choices
      });
    },
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
