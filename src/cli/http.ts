export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface HttpClientRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export type HttpClient = (
  url: string,
  init?: HttpClientRequest
) => Promise<HttpResponse>;
