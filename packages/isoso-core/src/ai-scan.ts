import {
  hasAiApiKey,
  resolveAiApiKey,
  resolveAiChatCompletionsUrl,
  resolveAiModel,
} from "./ai-config.js";
import { jsxRules } from "./rules/jsx-rules.js";
import type { Finding, Severity } from "./types.js";

const VALID_SEVERITIES = new Set<Severity>(["critical", "serious", "moderate", "minor"]);
const RULE_IDS = new Set(jsxRules.map((r) => r.id));
const RULE_BY_ID = new Map(jsxRules.map((r) => [r.id, r]));

const MAX_FILE_CHARS = 100_000;

export interface AiScanOptions {
  apiKey?: string;
  model?: string;
}

function ruleCatalogForPrompt(): string {
  return JSON.stringify(
    jsxRules.map((r) => ({
      ruleId: r.id,
      name: r.name,
      description: r.description,
      defaultSeverity: r.severity,
      wcag: r.wcag,
    })),
    null,
    2
  );
}

function numberedSource(source: string): string {
  return source
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(4, " ")}| ${line}`)
    .join("\n");
}

function snippetAtLine(source: string, line: number): string {
  const row = source.split("\n")[line - 1]?.trim() ?? "";
  if (!row) return `<line ${line}>`;
  return row.length > 120 ? `${row.slice(0, 117)}...` : row;
}

function normalizeFinding(raw: unknown, file: string, source: string): Finding | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const ruleId = typeof o.ruleId === "string" ? o.ruleId.trim() : "";
  if (!RULE_IDS.has(ruleId)) return null;

  const rule = RULE_BY_ID.get(ruleId)!;
  let severity = typeof o.severity === "string" ? (o.severity as Severity) : rule.severity;
  if (!VALID_SEVERITIES.has(severity)) severity = rule.severity;

  const line =
    typeof o.line === "number" && Number.isFinite(o.line) && o.line >= 1
      ? Math.floor(o.line)
      : 1;
  const column =
    typeof o.column === "number" && Number.isFinite(o.column) && o.column >= 1
      ? Math.floor(o.column)
      : 1;

  const message =
    typeof o.message === "string" && o.message.trim()
      ? o.message.trim()
      : rule.description;
  const fixHint =
    typeof o.fixHint === "string" && o.fixHint.trim() ? o.fixHint.trim() : undefined;

  let wcag: string[] = rule.wcag;
  if (Array.isArray(o.wcag)) {
    const parsed = o.wcag.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (parsed.length > 0) wcag = parsed;
  }

  const snippet =
    typeof o.snippet === "string" && o.snippet.trim()
      ? o.snippet.trim()
      : snippetAtLine(source, line);

  return {
    ruleId,
    message,
    severity,
    wcag,
    file,
    line,
    column,
    snippet,
    fixHint,
  };
}

export async function scanFileWithAi(
  file: string,
  source: string,
  options: AiScanOptions = {}
): Promise<Finding[]> {
  if (source.length > MAX_FILE_CHARS) {
    throw new Error(`File too large for AI scan (${source.length} chars): ${file}`);
  }

  const apiKey = resolveAiApiKey(options.apiKey);
  if (!apiKey) {
    throw new Error("ISOSO_AI_KEY is required for AI scan.");
  }

  const model = resolveAiModel(options.model);
  const chatUrl = resolveAiChatCompletionsUrl();

  const prompt = `You are an accessibility engineer reviewing React/TSX source code.

Use ONLY these rule IDs (same schema as Isoso static rules):
${ruleCatalogForPrompt()}

File path: ${file}

Analyze the numbered source for accessibility issues that match those rule categories.
Report real issues only; do not invent line numbers.
Use severity: critical | serious | moderate | minor (align with each rule's defaultSeverity when unsure).

Return JSON:
{
  "findings": [
    {
      "ruleId": "<one of the ruleId values above>",
      "message": "short issue description",
      "severity": "critical|serious|moderate|minor",
      "wcag": ["criterion name strings"],
      "line": <1-based line number>,
      "column": <1-based column, optional default 1>,
      "snippet": "optional code excerpt",
      "fixHint": "optional fix suggestion"
    }
  ]
}

If no issues, return { "findings": [] }.

Source:
${numberedSource(source)}`;

  const res = await fetch(chatUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI scan failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return [];

  let parsed: { findings?: unknown[] };
  try {
    parsed = JSON.parse(content) as { findings?: unknown[] };
  } catch {
    throw new Error("AI provider returned invalid JSON for scan results.");
  }

  const list = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings: Finding[] = [];
  for (const item of list) {
    const f = normalizeFinding(item, file, source);
    if (f) findings.push(f);
  }
  return findings;
}

export function hasAiScanKey(): boolean {
  return hasAiApiKey();
}
