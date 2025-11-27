import "../../tests/setup.js";
import { afterAll, beforeAll } from "vitest";
import { setTemplateLoader } from "../src/utils/templates.js";
import { templateFixtures } from "../../tests/template-fixtures.js";

beforeAll(() => {
  setTemplateLoader(async (relativePath) => {
    const template = templateFixtures.get(relativePath);
    if (!template) {
      throw new Error(`Missing template fixture for ${relativePath}`);
    }
    return template;
  });
});

afterAll(setTemplateLoader.bind(null, null));
