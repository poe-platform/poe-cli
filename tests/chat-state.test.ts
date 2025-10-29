import { describe, it, expect } from "vitest";
import { ChatState } from "../vscode-extension/src/state/chat-state.js";

describe("ChatState", () => {
  it("stores and clears messages", () => {
    const state = new ChatState();
    state.append({
      id: "1",
      role: "user",
      content: "Hello"
    });
    state.append({
      id: "2",
      role: "assistant",
      content: "Hi there"
    });

    expect(state.messages).toHaveLength(2);

    state.clear();
    expect(state.messages).toHaveLength(0);
  });

  it("tracks the last response timestamp", () => {
    const state = new ChatState();
    state.append({
      id: "1",
      role: "assistant",
      content: "Answer"
    });

    expect(state.lastResponseAt).toBeInstanceOf(Date);
  });
});

