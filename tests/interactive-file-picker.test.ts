import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "ink-testing-library";
import { Volume, createFsFromVolume } from "memfs";
import { InteractiveCli } from "../src/cli/interactive.js";

interface TestFs {
  readdir: (target: string) => Promise<string[]>;
  stat: (target: string) => Promise<{ isDirectory: () => boolean }>;
}

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

describe("Interactive CLI file picker behaviour", () => {
  let fileSystem: TestFs;
  const cwd = "/workspace";

  beforeEach(() => {
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

    stdin.write("@");
    await flushEffects();
    await expectFrameToContain(
      lastFrame,
      "Select a file (↑/↓ to navigate, Enter to select, Esc to cancel):"
    );

    stdin.write("b");
    await flushEffects();
    await expectPickerToShowOnly(lastFrame, "beta.txt", ["alpha.txt"]);
    await flushEffects();
    await flushEffects();

    stdin.write("\r");
    const sanitizedBeforeSecondMention = await expectInputToContain(
      lastFrame,
      "@beta.txt"
    );
    expect(sanitizedBeforeSecondMention).toContain("@beta.txt");

    stdin.write("@");
    await expectFrameToContain(
      lastFrame,
      "Select a file (↑/↓ to navigate, Enter to select, Esc to cancel):"
    );
    const sanitizedAfterSecondMention = await expectInputToContain(
      lastFrame,
      "@beta.txt @"
    );
    expect(sanitizedAfterSecondMention).toContain("@beta.txt @");

    instance.unmount();
  });
});
