import { beforeEach, describe, expect, it } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import { TaskLogger } from "../src/services/task-logger.js";

describe("TaskLogger", () => {
  let vol: Volume;
  let fs: typeof import("node:fs");
  const logFile = "/logs/task.log";

  beforeEach(() => {
    vol = new Volume();
    const memfs = createFsFromVolume(vol);
    fs = memfs as unknown as typeof import("node:fs");
    vol.mkdirSync("/logs", { recursive: true });
  });

  it("writes log entries with timestamps", async () => {
    const now = () => new Date("2024-01-30T22:00:00.000Z");
    const logger = new TaskLogger({
      fs,
      filePath: logFile,
      now
    });

    logger.info("Task started");
    logger.error("Task failed");

    const contents = await fs.promises.readFile(logFile, "utf8");
    expect(contents).toContain("TASK INFO Task started");
    expect(contents).toContain("TASK ERROR Task failed");
    expect(contents).toContain("[2024-01-30T22:00:00.000Z]");
  });

  it("rotates logs once max size is exceeded", async () => {
    const logger = new TaskLogger({
      fs,
      filePath: logFile,
      maxSize: 50,
      maxBackups: 2,
      now: () => new Date("2024-01-30T22:00:00.000Z")
    });

    for (let i = 0; i < 10; i++) {
      logger.info(`Entry ${i}`);
    }

    const files = await fs.promises.readdir("/logs");
    expect(files.sort()).toEqual(["task.log", "task.log.1", "task.log.2"]);

    const rotated = await fs.promises.readFile("/logs/task.log.1", "utf8");
    expect(rotated).toContain("Entry");
  });
});
