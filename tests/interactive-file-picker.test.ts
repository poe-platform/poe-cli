import React from "react";
import { Text } from "ink";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { Volume, createFsFromVolume } from "memfs";

interface TestFs {
  readdir: (target: string) => Promise<string[]>;
  stat: (target: string) => Promise<{ isDirectory: () => boolean }>;
}

type InputHarness = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (current: string) => void;
  placeholder?: string;
};

type InteractiveCliComponent = typeof import("../src/cli/interactive.js").InteractiveCli;
let InteractiveCli: InteractiveCliComponent;
let inputHarness: InputHarness | null = null;

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function stripAnsi(value: string | undefined): string {
  if (!value) {
    return "";
  }
  let result = "";
  let index = 0;
  while (index < value.length) {
    if (value[index] === "\u001B") {
      index += 1;
      if (index < value.length && (value[index] === "[" || value[index] === "]")) {
        index += 1;
      }
      while (index < value.length) {
        const code = value[index];
        const isLetter =
          (code >= "A" && code <= "Z") || (code >= "a" && code <= "z");
        if (isLetter) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    result += value[index];
    index += 1;
  }
  return result;
}

async function expectFrameToContain(
  readFrame: () => string | undefined,
  text: string
): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const frame = readFrame();
    if (frame?.includes(text)) {
      return;
    }
    await flushEffects();
  }
  throw new Error(
    `Timed out waiting for frame to include "${text}". Last frame:\n${readFrame() ?? "<empty>"}`
  );
}

async function expectPickerToShowOnly(
  readFrame: () => string | undefined,
  filename: string,
  excluded: string[]
): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const frame = readFrame();
    if (frame?.includes(filename) && excluded.every((value) => !frame.includes(value))) {
      return;
    }
    await flushEffects();
  }
  throw new Error(
    `Timed out waiting for picker to show "${filename}". Last frame:\n${readFrame() ?? "<empty>"}`
  );
}

async function expectInputToContain(
  readFrame: () => string | undefined,
  text: string
): Promise<string> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const sanitized = stripAnsi(readFrame());
    if (sanitized.includes(text)) {
      return sanitized;
    }
    await flushEffects();
  }
  throw new Error(
    `Timed out waiting for input to include "${text}". Last frame:\n${readFrame() ?? "<empty>"}`
  );
}

async function getHarness(): Promise<InputHarness> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (inputHarness) {
      return inputHarness;
    }
    await flushEffects();
  }
  throw new Error("Text input harness not initialized");
}

async function setInputValue(value: string): Promise<void> {
  const harness = await getHarness();
  harness.onChange(value);
  await flushEffects();
}

async function typeSequence(stdin: { write: (chunk: string) => void }, sequence: string): Promise<void> {
  for (const char of sequence) {
    stdin.write(char);
    await flushEffects();
  }
}

describe("Interactive CLI file picker behaviour", () => {
  let fileSystem: TestFs;
  const cwd = "/workspace";

  beforeEach(async () => {
    inputHarness = null;
    vi.resetModules();
    vi.doMock("ink-text-input", () => ({
      __esModule: true,
      default: (props: InputHarness) => {
        inputHarness = props;
        const label = props.value || props.placeholder || "";
        return React.createElement(Text, null, label);
      }
    }));
    const cliModule = await import("../src/cli/interactive.js");
    InteractiveCli = cliModule.InteractiveCli;

    const volume = new Volume();
    const memfs = createFsFromVolume(volume);
    const promises = memfs.promises;

    fileSystem = {
      readdir: (target) => promises.readdir(target),
      stat: (target) => promises.stat(target)
    };

    volume.mkdirSync(cwd, { recursive: true });
    volume.writeFileSync(`${cwd}/alpha.txt`, "");
    volume.writeFileSync(`${cwd}/beta.txt`, "");
    volume.writeFileSync(`${cwd}/ROADMAP.md`, "");
  });

  it("reopens the picker when typing a second mention after selecting the first", async () => {
    const onExit = vi.fn();
    const onCommand = vi.fn(async () => "");

    const element = React.createElement(InteractiveCli, {
      onExit,
      onCommand,
      cwd,
      fs: fileSystem
    });

    const instance = render(element);
    const { stdin, lastFrame } = instance;

    // Type "@"
    await setInputValue("@");
    await expectFrameToContain(
      lastFrame,
      "Select a file (↑/↓ to navigate, Enter to select, Esc to cancel):"
    );

    // Type "b" to filter
    await setInputValue("@b");
    await expectPickerToShowOnly(lastFrame, "beta.txt", ["alpha.txt"]);

    // Press Enter to select
    stdin.write("\r");
    await flushEffects();
    await flushEffects();

    // Verify the input was updated to include the selected file
    let harness = await getHarness();
    expect(harness.value).toBe("@beta.txt ");

    // Type second "@" by calling onChange on the harness
    harness.onChange("@beta.txt @");
    await flushEffects();

    await expectFrameToContain(
      lastFrame,
      "Select a file (↑/↓ to navigate, Enter to select, Esc to cancel):"
    );

    // Get fresh harness and verify the second @ was added
    harness = await getHarness();
    expect(harness.value).toBe("@beta.txt @");

    instance.unmount();
  });

  it("keeps the mention intact when the query contains spaces before selection", async () => {
    const onExit = vi.fn();
    const onCommand = vi.fn(async () => "");

    const element = React.createElement(InteractiveCli, {
      onExit,
      onCommand,
      cwd,
      fs: fileSystem
    });

    const instance = render(element);
    const { stdin, lastFrame } = instance;

    // Type "@"
    await setInputValue("@");
    await expectFrameToContain(
      lastFrame,
      "Select a file (↑/↓ to navigate, Enter to select, Esc to cancel):"
    );

    // Type " ROAD" to filter with space
    await setInputValue("@ ROAD");
    await expectPickerToShowOnly(lastFrame, "ROADMAP.md", ["alpha.txt", "beta.txt"]);

    // Press Enter to select
    stdin.write("\r");
    await flushEffects();
    await flushEffects();

    // Verify the input was updated to include the selected file
    let harness = await getHarness();
    expect(harness.value).toBe("@ROADMAP.md ");

    // Type "con" after the mention by calling onChange on the harness
    harness.onChange("@ROADMAP.md con");
    await flushEffects();

    // Get fresh harness and verify
    harness = await getHarness();
    expect(harness.value).toBe("@ROADMAP.md con");

    instance.unmount();
  });
});

afterEach(() => {
  vi.unmock("ink-text-input");
});

afterAll(() => {
  vi.resetModules();
});
