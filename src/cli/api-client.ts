import type { HttpClient } from "./http.js";

export interface VerifyApiKeyOptions {
  apiKey: string;
}

export interface QueryOptions {
  apiKey: string;
  model: string;
  prompt: string;
}

export interface PoeApiClient {
  verify(options: VerifyApiKeyOptions): Promise<void>;
  query(options: QueryOptions): Promise<string>;
}

export function createPoeApiClient(client: HttpClient): PoeApiClient {
  const verify = async (options: VerifyApiKeyOptions): Promise<void> => {
    const response = await client("https://api.poe.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: "EchoBot",
        messages: [{ role: "user", content: "Ping" }]
      })
    });

    if (!response.ok) {
      throw new Error(`Poe API test failed (status ${response.status}).`);
    }

    const payload = await response.json();
    const echoed = extractMessageContent(payload);
    if (echoed !== "Ping") {
      throw new Error("Poe API test failed: unexpected response payload.");
    }
  };

  const query = async (options: QueryOptions): Promise<string> => {
    const response = await client("https://api.poe.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content: options.prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Poe API query failed (status ${response.status}).`);
    }

    const payload = await response.json();
    const content = extractMessageContent(payload);
    if (!content) {
      throw new Error("Poe API query failed: missing response content.");
    }
    return content;
  };

  return { verify, query };
}

type PoeChoice = {
  message?: {
    content?: unknown;
  } | null;
};

type PoeResponse = {
  choices?: PoeChoice[];
};

function extractMessageContent(payload: unknown): string | null {
  if (!isPoeResponse(payload)) {
    return null;
  }

  const [first] = payload.choices;
  if (!first || typeof first !== "object") {
    return null;
  }

  const content = first.message?.content;
  return typeof content === "string" ? content : null;
}

function isPoeResponse(value: unknown): value is { choices: PoeChoice[] } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as PoeResponse;
  return Array.isArray(candidate.choices) && candidate.choices.length > 0;
}
