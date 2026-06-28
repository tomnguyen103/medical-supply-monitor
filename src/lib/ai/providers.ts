import { env, integrations } from "@/lib/env";
import { redactSensitiveText } from "@/lib/ai/safety";

export type AiProviderId = "openai" | "gemini" | "local";

export interface AiDraftInput {
  system: string;
  prompt: string;
}

export interface AiDraftResult {
  text: string;
  provider: AiProviderId;
  model: string;
  modelLabel: string;
}

export interface AiProviderConfig {
  id: AiProviderId;
  model: string;
  apiKey?: string;
  baseUrl: string;
}

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_LOCAL_LLM_MODEL = "llama3.2";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_LOCAL_LLM_BASE_URL = "http://localhost:11434/v1";

const DEFAULT_PROVIDER_ORDER: readonly AiProviderId[] = [
  "openai",
  "gemini",
  "local",
];

const MAX_TOKENS = 700;
const TEMPERATURE = 0.2;
const REQUEST_TIMEOUT_MS = 30_000;

export function getConfiguredAiProviders(): AiProviderConfig[] {
  const providers: AiProviderConfig[] = [];

  if (integrations.openai && env.ai.openaiApiKey) {
    providers.push({
      id: "openai",
      apiKey: env.ai.openaiApiKey,
      model: env.ai.openaiModel ?? DEFAULT_OPENAI_MODEL,
      baseUrl: env.ai.openaiBaseUrl ?? DEFAULT_OPENAI_BASE_URL,
    });
  }

  if (integrations.gemini && env.ai.geminiApiKey) {
    providers.push({
      id: "gemini",
      apiKey: env.ai.geminiApiKey,
      model: env.ai.geminiModel ?? DEFAULT_GEMINI_MODEL,
      baseUrl: env.ai.geminiBaseUrl ?? DEFAULT_GEMINI_BASE_URL,
    });
  }

  if (integrations.localLlm && env.ai.localLlmBaseUrl) {
    providers.push({
      id: "local",
      apiKey: env.ai.localLlmApiKey,
      model: env.ai.localLlmModel ?? DEFAULT_LOCAL_LLM_MODEL,
      baseUrl: env.ai.localLlmBaseUrl,
    });
  }

  return orderProviders(providers, env.ai.provider);
}

export function getAiModelLabel(): string {
  const provider = getConfiguredAiProviders()[0];
  return provider ? formatAiModelLabel(provider) : "ai-not-configured";
}

export function orderProviders(
  providers: AiProviderConfig[],
  preferredProvider: string | undefined | null,
): AiProviderConfig[] {
  const preferred = normalizeProviderId(preferredProvider);
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const order = preferred
    ? [
        preferred,
        ...DEFAULT_PROVIDER_ORDER.filter((provider) => provider !== preferred),
      ]
    : DEFAULT_PROVIDER_ORDER;

  return order
    .map((providerId) => providerById.get(providerId))
    .filter((provider): provider is AiProviderConfig => provider != null);
}

export async function draftRiskBriefWithAi(
  input: AiDraftInput,
  providers = getConfiguredAiProviders(),
): Promise<AiDraftResult> {
  if (providers.length === 0) {
    throw new Error("No AI provider is configured.");
  }

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const text = await draftWithProvider(provider, input);
      const safeText = redactSensitiveText(text).trim();
      if (!safeText) {
        throw new Error(`${formatAiModelLabel(provider)} returned an empty draft.`);
      }
      return {
        text: safeText,
        provider: provider.id,
        model: provider.model,
        modelLabel: formatAiModelLabel(provider),
      };
    } catch (error) {
      failures.push(`${formatAiModelLabel(provider)}: ${getErrorMessage(error)}`);
    }
  }

  throw new Error(
    `AI drafting failed for all configured providers. ${failures.join(" ")}`,
  );
}

export function formatAiModelLabel(provider: AiProviderConfig): string {
  return `${provider.id}:${provider.model}`;
}

function normalizeProviderId(value: string | undefined | null): AiProviderId | null {
  if (value === "openai" || value === "gemini" || value === "local") return value;
  return null;
}

async function draftWithProvider(
  provider: AiProviderConfig,
  input: AiDraftInput,
): Promise<string> {
  if (provider.id === "openai") return draftWithOpenAi(provider, input);
  if (provider.id === "gemini") return draftWithGemini(provider, input);
  return draftWithLocalOpenAiCompatible(provider, input);
}

async function draftWithOpenAi(
  provider: AiProviderConfig,
  input: AiDraftInput,
): Promise<string> {
  if (!provider.apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const payload = await fetchJson(
    `${trimBaseUrl(provider.baseUrl)}/responses`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        instructions: input.system,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: input.prompt }],
          },
        ],
        max_output_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        store: false,
      }),
    },
    provider,
  );
  return extractOpenAiResponseText(payload);
}

async function draftWithGemini(
  provider: AiProviderConfig,
  input: AiDraftInput,
): Promise<string> {
  if (!provider.apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const url = new URL(
    `${trimBaseUrl(provider.baseUrl)}/models/${encodeURIComponent(
      provider.model,
    )}:generateContent`,
  );
  url.searchParams.set("key", provider.apiKey);

  const payload = await fetchJson(
    url.toString(),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${input.system}\n\n${input.prompt}` }],
          },
        ],
        generationConfig: {
          maxOutputTokens: MAX_TOKENS,
          temperature: TEMPERATURE,
        },
      }),
    },
    provider,
  );
  return extractGeminiText(payload);
}

async function draftWithLocalOpenAiCompatible(
  provider: AiProviderConfig,
  input: AiDraftInput,
): Promise<string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

  const payload = await fetchJson(
    `${trimBaseUrl(provider.baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
    },
    provider,
  );
  return extractOpenAiCompatibleChatText(payload);
}

async function fetchJson(
  url: string,
  init: RequestInit,
  provider: AiProviderConfig,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `request failed with ${response.status} ${response.statusText}`.trim(),
      );
    }
    return response.json() as Promise<unknown>;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpenAiResponseText(payload: unknown): string {
  const record = asRecord(payload);
  const direct = asString(record?.output_text);
  if (direct) return direct;

  const chunks: string[] = [];
  for (const item of asArray(record?.output)) {
    const itemRecord = asRecord(item);
    for (const block of asArray(itemRecord?.content)) {
      const blockRecord = asRecord(block);
      const text = asString(blockRecord?.text);
      if (text) chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

function extractGeminiText(payload: unknown): string {
  const record = asRecord(payload);
  const direct = asString(record?.output_text);
  if (direct) return direct;

  const chunks: string[] = [];
  for (const candidate of asArray(record?.candidates)) {
    const candidateRecord = asRecord(candidate);
    const content = asRecord(candidateRecord?.content);
    for (const part of asArray(content?.parts)) {
      const text = asString(asRecord(part)?.text);
      if (text) chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

function extractOpenAiCompatibleChatText(payload: unknown): string {
  const record = asRecord(payload);
  const chunks: string[] = [];
  for (const choice of asArray(record?.choices)) {
    const message = asRecord(asRecord(choice)?.message);
    const content = asString(message?.content);
    if (content) chunks.push(content);
  }
  return chunks.join("\n").trim();
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider error.";
}
