import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { setTemplateLoader } from "../src/utils/templates.js";
import { templateFixtures } from "./template-fixtures.js";

beforeAll(() => {
  setTemplateLoader(async (relativePath) => {
    const template = templateFixtures.get(relativePath);
    if (!template) {
      throw new Error(`Missing template fixture for ${relativePath}`);
    }
    return template;
  });
});

afterAll(() => {
  setTemplateLoader(null);
});

const fetchMock = vi.fn(async () => {
  throw new Error("Unexpected fetch invocation. Provide a mock implementation.");
});

vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => {
    throw new Error("Unexpected fetch invocation. Provide a mock implementation.");
  });
});
