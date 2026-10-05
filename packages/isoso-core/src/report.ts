import { summarizeFindings } from "./engine.js";
import type { ScanResult, Severity } from "./types.js";

const SEVERITY_ORDER: Severity[] = ["critical", "serious", "moderate", "minor"];

export function formatTextReport(result: ScanResult): string {
  const { bySeverity, total } = summarizeFindings(result.findings);
  const engineLabel = result.engine === "ai" ? "AI" : "static rules";
  const lines: string[] = [
    "Isoso accessibility scan",
    `Engine: ${engineLabel}`,
    `Root: ${result.root}`,
    `Files scanned: ${result.filesScanned}`,
    `Findings: ${total}`,
    "",
  ];

  for (const sev of SEVERITY_ORDER) {
    const count = bySeverity[sev] ?? 0;
    if (count > 0) lines.push(`  ${sev}: ${count}`);
  }
  lines.push("");

  const sorted = [...result.findings].sort((a, b) => {
    const sa = SEVERITY_ORDER.indexOf(a.severity);
    const sb = SEVERITY_ORDER.indexOf(b.severity);
    if (sa !== sb) return sa - sb;
    return a.file.localeCompare(b.file) || a.line - b.line;
  });

  for (const f of sorted) {
    lines.push(
      `[${f.severity}] ${f.ruleId} — ${f.file}:${f.line}:${f.column}`,
      `  ${f.message}`,
      ...(f.fixHint ? [`  Fix: ${f.fixHint}`] : []),
      ""
    );
  }

  if (total === 0) {
    lines.push(
      result.engine === "ai"
        ? "No issues reported by AI for the scanned files."
        : "No issues detected by Isoso static rules."
    );
  }

  lines.push(`Completed in ${result.durationMs}ms`);
  return lines.join("\n");
}

export function formatJsonReport(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function exitCodeForResult(result: ScanResult, failOn: Severity = "serious"): number {
  const threshold = SEVERITY_ORDER.indexOf(failOn);
  for (const f of result.findings) {
    if (SEVERITY_ORDER.indexOf(f.severity) <= threshold) {
      return 1;
    }
  }
  return 0;
}
