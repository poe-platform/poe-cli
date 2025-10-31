import { test, expect } from "@playwright/test";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { execSync } from "node:child_process";

const previewDir = path.resolve(process.cwd(), "vscode-extension/preview");

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address) {
          resolve(address.port);
        } else {
          reject(new Error("Failed to allocate port"));
        }
      });
    });
  });
}

async function waitForOutput(stream: NodeJS.ReadableStream, matcher: RegExp, timeout = 10_000): Promise<void> {
  const chunks: string[] = [];
  let resolve: (() => void) | null = null;
  const listener = (chunk: Buffer | string) => {
    const text = chunk.toString();
    chunks.push(text);
    if (matcher.test(text)) {
      stream.off("data", listener);
      resolve?.();
    }
  };
  const done = new Promise<void>((res) => {
    resolve = res;
  });
  stream.on("data", listener);
  const timer = delay(timeout).then(() => {
    stream.off("data", listener);
    throw new Error(`Timed out waiting for output matching ${matcher}. Captured:\n${chunks.join("")}`);
  });
  await Promise.race([done, timer]);
}

test.beforeAll(() => {
  execSync("npm run build:webview", { stdio: "inherit" });
});

test("preview webview connects and echoes responses", async ({ page }) => {
  const port = await getAvailablePort();
  const serverProcess = spawn("node", ["server.js"], {
    cwd: previewDir,
    env: {
      ...process.env,
      PORT: String(port),
      POE_PREVIEW_ALLOW_NO_CREDENTIALS: "1",
      POE_PREVIEW_DEBUG_MESSAGES: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    if (serverProcess.stdout) {
      await waitForOutput(serverProcess.stdout, /Preview Server Running/);
    } else {
      await delay(500);
    }

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(() => (window as any).__poePreviewConnected === true, null, { timeout: 20_000 });
    await page.waitForFunction(() => typeof (window as any).initializeWebviewApp === "function");

    const input = page.locator('[data-test="message-input"]');
    await expect(input).toBeVisible();
    await input.fill("ping");
    await page.locator('[data-test="send-button"]').click();

    const userMessage = page.locator('[data-test="message-wrapper-user"]').last();
    await expect(userMessage).toContainText("ping", { timeout: 10_000 });

    const assistantMessage = page.locator('[data-test="message-wrapper-assistant"] .message-content').last();
    await expect(assistantMessage).toContainText("Mock response: ping", { timeout: 10_000 });
  } finally {
    serverProcess.kill();
    await once(serverProcess, "exit").catch(() => {});
  }
});
