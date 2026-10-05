import { getRuleById } from "./rules/jsx-rules.js";
import type { Finding } from "./types.js";

function fileFinding(
  ruleId: string,
  file: string,
  line: number,
  message: string,
  fixHint?: string,
): Finding {
  const rule = getRuleById(ruleId);
  return {
    ruleId,
    message,
    severity: rule?.severity ?? "moderate",
    wcag: rule?.wcag ?? [],
    file,
    line,
    column: 1,
    fixHint,
  };
}

export function runFileRules(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split("\n");
  let h1Lines: number[] = [];
  let mainLines: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i] ?? "";

    if (/<h1\b/i.test(line)) h1Lines.push(lineNum);
    if (/<main\b/i.test(line) || /\brole\s*=\s*["']main["']/i.test(line)) {
      mainLines.push(lineNum);
    }

    if (/<html\b/i.test(line) && !/\blang\s*=/.test(line)) {
      findings.push(
        fileFinding(
          "html-missing-lang",
          file,
          lineNum,
          "<html> is missing a lang attribute.",
          'Add lang="en" (or the page language).',
        ),
      );
    }
  }

  if (h1Lines.length > 1) {
    findings.push(
      fileFinding(
        "multiple-h1",
        file,
        h1Lines[1]!,
        `Document has ${h1Lines.length} <h1> elements; use one per view.`,
        "Use a single <h1> for the page title; use h2–h6 for sections.",
      ),
    );
  }

  if (mainLines.length > 1) {
    findings.push(
      fileFinding(
        "multiple-main-landmarks",
        file,
        mainLines[1]!,
        "Multiple main landmarks in one file.",
        "Use one <main> per document; use sections elsewhere.",
      ),
    );
  }

  return findings;
}
