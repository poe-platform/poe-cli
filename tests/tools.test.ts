import { describe, it, expect, vi } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import type { FileSystem } from "../src/utils/file-system.js";
import { DefaultToolExecutor } from "../src/services/tools.js";

describe("DefaultToolExecutor", () => {
  it("invokes onWriteFile callback with previous and next content", async () => {
    const vol = new Volume();
    const fs = createFsFromVolume(vol);
    vol.mkdirSync("/workspace", { recursive: true });
    vol.writeFileSync("/workspace/file.txt", "old", "utf8");

    const handler = vi.fn();
    const executor = new DefaultToolExecutor({
      fs: fs.promises as unknown as FileSystem,
      cwd: "/workspace",
      onWriteFile: handler
    });

    await executor.executeTool("write_file", {
      path: "file.txt",
      content: "new"
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0][0];
    expect(payload.absolutePath).toBe("/workspace/file.txt");
    expect(payload.previousContent).toBe("old");
    expect(payload.nextContent).toBe("new");
  });
});

