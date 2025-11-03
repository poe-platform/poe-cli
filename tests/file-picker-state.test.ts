import { describe, expect, it } from "vitest";
import {
  evaluateFilePickerAction,
  type FilePickerAction
} from "../src/cli/file-picker-state.js";

function actionKind(value: string, isOpen: boolean): FilePickerAction["kind"] | "none" {
  const result = evaluateFilePickerAction({ value, isOpen });
  return result ? result.kind : "none";
}

describe("evaluateFilePickerAction", () => {
  it("opens picker when trailing @ is typed", () => {
    const result = evaluateFilePickerAction({ value: "@", isOpen: false });
    expect(result).toEqual({ kind: "open", prefix: "" });
  });

  it("re-opens picker even if it was already open", () => {
    const kind = actionKind("files@", true);
    expect(kind).toBe("open");
  });

  it("updates search query when characters follow @", () => {
    const result = evaluateFilePickerAction({ value: "files@src", isOpen: true });
    expect(result).toEqual({ kind: "search", query: "src" });
  });

  it("closes picker when @ is removed", () => {
    const result = evaluateFilePickerAction({ value: "files", isOpen: true });
    expect(result).toEqual({ kind: "close" });
  });

  it("returns null when picker stays closed", () => {
    const kind = actionKind("files", false);
    expect(kind).toBe("none");
  });
});
