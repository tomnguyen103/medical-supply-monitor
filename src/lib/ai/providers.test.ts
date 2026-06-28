import { afterEach, describe, expect, it, vi } from "vitest";

import {
  draftRiskBriefWithAi,
  orderProviders,
  type AiProviderConfig,
} from "@/lib/ai/providers";

const input = {
  system: "Draft an operations brief. Do not compute scores.",
  prompt: JSON.stringify({ scoreSummary: { criticalCount: 1 } }),
};

describe("AI providers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prioritizes the preferred configured provider", () => {
    const providers: AiProviderConfig[] = [
      {
        id: "openai",
        apiKey: "openai-key",
        model: "gpt-test",
        baseUrl: "https://api.openai.com/v1",
      },
      {
        id: "gemini",
        apiKey: "gemini-key",
        model: "gemini-test",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      },
      {
        id: "local",
        model: "local-test",
        baseUrl: "http://localhost:11434/v1",
      },
    ];

    expect(orderProviders(providers, "gemini").map((provider) => provider.id)).toEqual([
      "gemini",
      "openai",
      "local",
    ]);
  });

  it("drafts through OpenAI Responses API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        output_text: "OpenAI risk brief.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await draftRiskBriefWithAi(input, [
      {
        id: "openai",
        apiKey: "openai-key",
        model: "gpt-test",
        baseUrl: "https://api.openai.com/v1/",
      },
    ]);

    expect(result).toMatchObject({
      provider: "openai",
      model: "gpt-test",
      modelLabel: "openai:gpt-test",
      text: "OpenAI risk brief.",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "gpt-test",
      instructions: input.system,
      max_output_tokens: 700,
      temperature: 0.2,
      store: false,
    });
  });

  it("drafts through Gemini generateContent API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: "Gemini risk brief." }],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await draftRiskBriefWithAi(input, [
      {
        id: "gemini",
        apiKey: "gemini-key",
        model: "gemini-test",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      },
    ]);

    expect(result).toMatchObject({
      provider: "gemini",
      modelLabel: "gemini:gemini-test",
      text: "Gemini risk brief.",
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
    );
    expect(url.searchParams.get("key")).toBe("gemini-key");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.contents[0].parts[0].text).toContain(input.prompt);
    expect(body.generationConfig).toMatchObject({
      maxOutputTokens: 700,
      temperature: 0.2,
    });
  });

  it("falls back to a local OpenAI-compatible provider when the primary fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "unavailable" }), {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [
            {
              message: {
                content: "Local draft for jane@example.com.",
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await draftRiskBriefWithAi(input, [
      {
        id: "openai",
        apiKey: "openai-key",
        model: "gpt-test",
        baseUrl: "https://api.openai.com/v1",
      },
      {
        id: "local",
        model: "local-test",
        baseUrl: "http://localhost:11434/v1",
      },
    ]);

    expect(result).toMatchObject({
      provider: "local",
      modelLabel: "local:local-test",
      text: "Local draft for [redacted-email].",
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
