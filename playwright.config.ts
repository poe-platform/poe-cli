import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    headless: true,
  },
  reporter: [["list"]],
});
