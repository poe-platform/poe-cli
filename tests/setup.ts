import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { setTemplateLoader } from "../src/utils/templates.js";

const templateFixtures = new Map<string, string>([
  [
    "python/env.hbs",
    [
      "POE_API_KEY={{apiKey}}",
      "POE_BASE_URL=https://api.poe.com/v1",
      "MODEL={{model}}"
    ].join("\n")
  ],
  [
    "python/main.py.hbs",
    [
      "import os",
      "from openai import OpenAI",
      "from dotenv import load_dotenv",
      "",
      "load_dotenv()",
      "",
      "client = OpenAI(",
      '    _key=os.getenv("POE_API_KEY"),',
      '    base_url=os.getenv("POE_BASE_URL")',
      ")",
      "",
      "response = client.chat.completions.create(",
      '    model=os.getenv("MODEL", "{{model}}"),',
      '    messages=[{"role": "user", "content": "Tell me a joke"}]',
      ")",
      "",
      "print(response.choices[0].message.content)"
    ].join("\n")
  ],
  [
    "python/requirements.txt.hbs",
    ["openai>=1.0.0", "python-dotenv>=1.0.0"].join("\n")
  ],
  [
    "claude-code/anthropic_key.sh.hbs",
    [
      "#!/bin/bash",
      'node -e "console.log(require({{{credentialsPathLiteral}}}).apiKey)"'
    ].join("\n")
  ]
]);

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
