import { describe, it, expect, beforeEach } from "vitest";
import { Volume, createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import {
  loadCredentials,
  saveCredentials
} from "../src/services/credentials.js";

function createMemFs(): FileSystem {
  const vol = new Volume();
  return createFsFromVolume(vol).promises as unknown as FileSystem;
}

describe("credentials store", () => {
  const credentialsPath = "/home/user/.poe-code/credentials.json";
  let fs: FileSystem;

  beforeEach(async () => {
    fs = createMemFs();
    await fs.mkdir(path.dirname(credentialsPath), { recursive: true });
  });

  it("returns stored api key when file is valid json", async () => {
    await saveCredentials({
      fs,
      filePath: credentialsPath,
      apiKey: "test-key"
    });

    const apiKey = await loadCredentials({
      fs,
      filePath: credentialsPath
    });

    expect(apiKey).toBe("test-key");
  });

  it("backs up and resets invalid json content", async () => {
    await fs.writeFile(credentialsPath, "test\n", { encoding: "utf8" });

    const apiKey = await loadCredentials({
      fs,
      filePath: credentialsPath
    });

    expect(apiKey).toBeNull();

    const credentialsDir = path.dirname(credentialsPath);
    const entries = await fs.readdir(credentialsDir);
    const backupName = entries.find((entry) =>
      entry.startsWith("credentials.json.invalid-")
    );
    expect(backupName).toBeDefined();

    const backupPath = path.join(credentialsDir, backupName as string);
    const backupContent = await fs.readFile(backupPath, "utf8");
    expect(backupContent).toBe("test\n");

    const rewritten = await fs.readFile(credentialsPath, "utf8");
    expect(JSON.parse(rewritten)).toEqual({});
  });
});
