const DEFAULT_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

/** Legacy alias; prefer ISOSO_AI_KEY. */
const LEGACY_AI_KEY_ENV = "OPENAI_API_KEY";

export function resolveAiApiKey(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const key = process.env.ISOSO_AI_KEY ?? process.env[LEGACY_AI_KEY_ENV];
  const trimmed = key?.trim();
  return trimmed || undefined;
}

export function hasAiApiKey(): boolean {
  return Boolean(resolveAiApiKey());
}

/**
 * Chat completions endpoint (JSON API with choices[].message.content).
 * Set ISOSO_AI_CHAT_URL to the full URL, or ISOSO_AI_BASE_URL (e.g. https://host/v1).
 */
export function resolveAiChatCompletionsUrl(): string {
  const full = process.env.ISOSO_AI_CHAT_URL?.trim();
  if (full) return full.replace(/\/$/, "");

  const base = process.env.ISOSO_AI_BASE_URL?.trim().replace(/\/$/, "");
  if (base) return `${base}/chat/completions`;

  return DEFAULT_CHAT_COMPLETIONS_URL;
}

export function resolveAiModel(explicit?: string): string {
  return explicit ?? process.env.ISOSO_AI_MODEL?.trim() ?? "gpt-4o-mini";
}
