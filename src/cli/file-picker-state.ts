export interface EvaluateFilePickerInput {
  value: string;
  isOpen: boolean;
}

export type FilePickerAction =
  | {
      kind: "open";
      prefix: string;
    }
  | {
      kind: "search";
      query: string;
    }
  | {
      kind: "close";
    };

export function evaluateFilePickerAction(
  input: EvaluateFilePickerInput
): FilePickerAction | null {
  const { value, isOpen } = input;

  if (value.endsWith("@")) {
    return {
      kind: "open",
      prefix: value.slice(0, -1)
    };
  }

  if (!isOpen) {
    return null;
  }

  const atIndex = value.lastIndexOf("@");
  if (atIndex === -1) {
    return {
      kind: "close"
    };
  }

  return {
    kind: "search",
    query: value.slice(atIndex + 1)
  };
}
