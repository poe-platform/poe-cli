import { describe, it, expect } from "vitest";
import { ChatState } from "../src/state/chat-state.js";

describe("ChatState", () => {
  it("tracks messages and timestamps", () => {
    const state = new ChatState();
    expect(state.messages).toEqual([]);
    expect(state.lastResponseAt).toBeNull();

    state.append({ id: "u-1", role: "user", content: "Hello" });
    expect(state.messages).toHaveLength(1);
    expect(state.lastResponseAt).toBeNull();

    state.append({ id: "a-1", role: "assistant", content: "Hi there" });
    expect(state.messages).toHaveLength(2);
    expect(state.lastResponseAt).toBeInstanceOf(Date);
  });

  it("clears history and resets timestamps", () => {
    const state = new ChatState();
    state.append({ id: "a-1", role: "assistant", content: "Hi" });
    state.clear();
    expect(state.messages).toEqual([]);
    expect(state.lastResponseAt).toBeNull();
  });
});
