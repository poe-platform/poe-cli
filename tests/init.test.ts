import { describe, it, expect } from "vitest";
import { Volume } from "memfs";
import { createFsFromVolume } from "memfs";
import path from "node:path";
import type { FileSystem } from "../src/utils/file-system.js";
import { initProject } from "../src/commands/init.js";

function createMemFs(): FileSystem {
  const vol = new Volume();
  const fs = createFsFromVolume(vol);
  vol.mkdirSync("/workspace", { recursive: true });
  return fs.promises as unknown as FileSystem;
}

describe("initProject", () => {
  it("creates python project files from templates", async () => {
    const fs = createMemFs();
    const projectName = "demo";
    const cwd = "/workspace";

    await initProject({
      fs,
      cwd,
      projectName,
      apiKey: "secret",
      model: "gpt-5"
    });

    const projectDir = path.join(cwd, projectName);

    const env = await fs.readFile(path.join(projectDir, ".env"), "utf8");
    const mainPy = await fs.readFile(path.join(projectDir, "main.py"), "utf8");
    const requirements = await fs.readFile(
      path.join(projectDir, "requirements.txt"),
      "utf8"
    );

    expect(env).toContain("POE_API_KEY=secret");
    expect(env).toContain("MODEL=gpt-5");
    expect(mainPy).toContain("Tell me a joke");
    expect(requirements).toContain("openai");
  });

  it("fails when project directory already exists", async () => {
    const fs = createMemFs();
    const projectName = "demo";
    const cwd = "/workspace";
    await fs.mkdir(path.join(cwd, projectName), { recursive: true });

    await expect(
      initProject({
        fs,
        cwd,
        projectName,
        apiKey: "secret",
        model: "gpt-5"
      })
    ).rejects.toThrow(/already exists/i);
  });
});
