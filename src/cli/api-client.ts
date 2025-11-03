import type { HttpClient } from "./http.js";
import { ApiError } from "./errors.js";

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

const POE_API_ENDPOINT = "https://api.poe.com/v1/chat/completions";

export function createPoeApiClient(client: HttpClient): PoeApiClient {
  const verify = async (options: VerifyApiKeyOptions): Promise<void> => {
    const requestBody = {
      model: "EchoBot",
      messages: [{ role: "user", content: "Ping" }]
    };

    let response;
    let responseBody;

    try {
      response = await client(POE_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      responseBody = await response.json();

      if (!response.ok) {
        throw new ApiError("Poe API test failed", {
          httpStatus: response.status,
          endpoint: POE_API_ENDPOINT,
          context: {
            operation: "verify API key",
            requestBody,
            responseBody
          }
        });
      }

      const echoed = extractMessageContent(responseBody);
      if (echoed !== "Ping") {
        throw new ApiError("Poe API test failed: unexpected response payload", {
          httpStatus: response.status,
          endpoint: POE_API_ENDPOINT,
          context: {
            operation: "verify API key",
            expected: "Ping",
            received: echoed,
            responseBody
          }
        });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      // Network or other errors
      throw new ApiError(`Failed to connect to Poe API: ${String(error)}`, {
        endpoint: POE_API_ENDPOINT,
        context: {
          operation: "verify API key",
          requestBody,
          originalError: String(error)
        }
      });
    }
  };

  const query = async (options: QueryOptions): Promise<string> => {
    const requestBody = {
      model: options.model,
      messages: [{ role: "user", content: options.prompt }]
    };

    let response;
    let responseBody;

    try {
      response = await client(POE_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      responseBody = await response.json();

      if (!response.ok) {
        throw new ApiError("Poe API query failed", {
          httpStatus: response.status,
          endpoint: POE_API_ENDPOINT,
          context: {
            operation: "query",
            model: options.model,
            requestBody,
            responseBody
          }
        });
      }

      const content = extractMessageContent(responseBody);
      if (!content) {
        throw new ApiError("Poe API query failed: missing response content", {
          httpStatus: response.status,
          endpoint: POE_API_ENDPOINT,
          context: {
            operation: "query",
            model: options.model,
            responseBody
          }
        });
      }
      return content;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      // Network or other errors
      throw new ApiError(`Failed to connect to Poe API: ${String(error)}`, {
        endpoint: POE_API_ENDPOINT,
        context: {
          operation: "query",
          model: options.model,
          requestBody,
          originalError: String(error)
        }
      });
    }
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
