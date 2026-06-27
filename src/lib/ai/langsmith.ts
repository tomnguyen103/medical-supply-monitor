import { env, integrations } from "@/lib/env";

/**
 * LangSmith tracing configuration for AI workflows.
 *
 * Tracing is OFF unless LANGSMITH_TRACING=true AND an API key is present. The
 * LangChain/LangGraph SDKs read these env vars at runtime; `configureLangSmith`
 * makes the resolved values explicit and is safe to call when unconfigured.
 *
 * Guardrail: never send PHI or tenant secrets to traces. Trace payloads are
 * restricted to non-sensitive supply/risk metadata.
 */
export const isLangSmithEnabled = integrations.langsmith && env.langsmith.tracing;

export function configureLangSmith(): void {
  if (!integrations.langsmith || !env.langsmith.apiKey) return;
  process.env.LANGSMITH_TRACING = env.langsmith.tracing ? "true" : "false";
  process.env.LANGSMITH_API_KEY = env.langsmith.apiKey;
  process.env.LANGSMITH_PROJECT = env.langsmith.project;
  process.env.LANGSMITH_ENDPOINT = env.langsmith.endpoint;
}
