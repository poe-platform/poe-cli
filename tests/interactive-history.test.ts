import React from "react";
import { Text } from "ink";
import { afterAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render } from "ink-testing-library";
import { Volume, createFsFromVolume } from "memfs";

type TestFs = {
  readdir: (target: string) => Promise<string[]>;
  stat: (target: string) => Promise<{ isDirectory: () => boolean }>;
};

type InputHarness = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (current: string) => void;
  placeholder?: string;
};

type InteractiveCliComponent = typeof import("../src/cli/interactive.js").InteractiveCli;
let InteractiveCli: InteractiveCliComponent;

const KEY_UP = "\u001B[A";
const KEY_DOWN = "\u001B[B";

let inputHarness: InputHarness | null = null;

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function getHarness(): Promise<InputHarness> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (inputHarness) {
      return inputHarness;
    }
    await flushEffects();
  }
  throw new Error("Text input harness not initialised");
}

async function setInputValue(value: string): Promise<void> {
  const harness = await getHarness();
  harness.onChange(value);
  await flushEffects();
}

async function submitCurrent(): Promise<void> {
  const harness = await getHarness();
  const current = harness.value;
  harness.onSubmit(current);
  await flushEffects();
}

async function enterMessage(value: string): Promise<void> {
  await setInputValue(value);
  const harness = await getHarness();
  harness.onSubmit(value);
  await flushEffects();
}

async function expectInputValue(expected: string): Promise<void> {
  const harness = await getHarness();
  expect(harness.value).toBe(expected);
}

async function waitForCallCount(mock: Mock, total: number): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (mock.mock.calls.length >= total) {
      return;
    }
    await flushEffects();
  }
  throw new Error(`Timed out waiting for call count ${total}`);
}

async function press(stdin: { write: (chunk: string) => void }, sequence: string): Promise<void> {
  stdin.write(sequence);
  await flushEffects();
}

async function expectFrameText(readFrame: () => string | undefined, snippet: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const frame = readFrame() ?? "";
    if (frame.includes(snippet)) {
      return;
    }
    await flushEffects();
  }
  throw new Error(`Timed out waiting for frame to include "${snippet}"`);
}

describe("Interactive CLI input history", () => {
  let fs: TestFs;
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

    fs = {
      readdir: (target) => promises.readdir(target),
      stat: (target) => promises.stat(target)
    };

    volume.mkdirSync(cwd, { recursive: true });
    volume.writeFileSync(`${cwd}/alpha.txt`, "");
    volume.writeFileSync(`${cwd}/beta.txt`, "");
  });

  it("cycles through submitted messages with arrow keys", async () => {
    const onCommand = vi.fn(async () => "done");

    const { stdin, unmount } = render(
      React.createElement(InteractiveCli, {
        onExit: vi.fn(),
        onCommand,
        cwd,
        fs
      })
    );

    await enterMessage("first");
    await waitForCallCount(onCommand, 1);
    expect(onCommand.mock.calls[0][0]).toBe("first");
    await expectInputValue("");

    await enterMessage("second");
    await waitForCallCount(onCommand, 2);
    expect(onCommand.mock.calls[1][0]).toBe("second");
    await expectInputValue("");

    await press(stdin, KEY_UP);
    await flushEffects();
    await expectInputValue("second");

    await press(stdin, KEY_UP);
    await flushEffects();
    await expectInputValue("first");

    await press(stdin, KEY_DOWN);
    await flushEffects();
    await expectInputValue("second");

    await press(stdin, KEY_DOWN);
    await flushEffects();
    await expectInputValue("");

    unmount();
  });

  it("ignores history rotation while the file picker is open", async () => {
    const onCommand = vi.fn(async () => "ack");

    const { stdin, lastFrame, unmount } = render(
      React.createElement(InteractiveCli, {
        onExit: vi.fn(),
        onCommand,
        cwd,
        fs
      })
    );

    await enterMessage("hello");
    await waitForCallCount(onCommand, 1);
    await expectInputValue("");

    await setInputValue("@");
    await flushEffects();
    await expectFrameText(lastFrame, "Select a file");

    await press(stdin, KEY_UP);
    await expectInputValue("@");

    unmount();
  });

  it("stops browsing history after manual edits", async () => {
    const onCommand = vi.fn(async () => "ok");

    const { stdin, unmount } = render(
      React.createElement(InteractiveCli, {
        onExit: vi.fn(),
        onCommand,
        cwd,
        fs
      })
    );

    await enterMessage("ping");
    await waitForCallCount(onCommand, 1);

    await press(stdin, KEY_UP);
    await flushEffects();
    await expectInputValue("ping");

    await setInputValue("ping!");
    await expectInputValue("ping!");

    await press(stdin, KEY_DOWN);
    await flushEffects();
    await expectInputValue("ping!");

    unmount();
  });

  it("does not capture blank submissions in the history", async () => {
    const onCommand = vi.fn(async () => "ok");

    const { stdin, unmount } = render(
      React.createElement(InteractiveCli, {
        onExit: vi.fn(),
        onCommand,
        cwd,
        fs
      })
    );

    await submitCurrent();
    expect(onCommand).not.toHaveBeenCalled();
    await expectInputValue("");

    await enterMessage("value");
    await waitForCallCount(onCommand, 1);
    expect(onCommand.mock.calls[0][0]).toBe("value");

    await press(stdin, KEY_UP);
    await flushEffects();
    await expectInputValue("value");

    unmount();
  });

afterEach(() => {
  vi.unmock("ink-text-input");
});

afterAll(() => {
  vi.resetModules();
});

});
