import { jsxRules } from "./rules/jsx-rules.js";
import type { Finding, JsxElementContext, Rule } from "./types.js";

export function getRules(customRuleIds?: string[]): Rule[] {
  if (!customRuleIds?.length) return jsxRules;
  const set = new Set(customRuleIds);
  return jsxRules.filter((r) => set.has(r.id));
}

export function runRulesOnElement(
  element: JsxElementContext,
  rules: Rule[] = jsxRules
): Finding[] {
  const findings: Finding[] = [];
  for (const rule of rules) {
    const result = rule.check(element);
    if (result) findings.push(result);
  }
  return findings;
}

export function summarizeFindings(findings: Finding[]): {
  total: number;
  bySeverity: Record<string, number>;
} {
  const bySeverity: Record<string, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  }
  return { total: findings.length, bySeverity };
}
