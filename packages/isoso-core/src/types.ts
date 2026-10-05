export type Severity = "critical" | "serious" | "moderate" | "minor";

export interface Finding {
  ruleId: string;
  message: string;
  severity: Severity;
  wcag: string[];
  file: string;
  line: number;
  column: number;
  snippet?: string;
  fixHint?: string;
}

export type ScanEngine = "ai" | "static";

export interface ScanResult {
  root: string;
  scannedAt: string;
  filesScanned: number;
  findings: Finding[];
  durationMs: number;
  engine: ScanEngine;
}

export interface JsxElementContext {
  file: string;
  tagName: string;
  line: number;
  column: number;
  attributes: Record<string, string | boolean | undefined>;
  hasChildrenText: boolean;
  snippet: string;
  eventHandlers: string[];
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  wcag: string[];
  severity: Severity;
  check: (element: JsxElementContext) => Finding | null;
}

export interface ExplainOptions {
  apiKey?: string;
  model?: string;
  /** Use curated static copy instead of AI (default is AI when ISOSO_AI_KEY is set). */
  preferBuiltin?: boolean;
}

export interface Explanation {
  summary: string;
  impact: string;
  remediation: string;
  source: "builtin" | "ai";
}
