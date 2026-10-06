import { jsxRules } from "./rules/jsx-rules.js";

/** Static rule ids that `isoso fix` attempts to auto-fix (same rule set as static scan). */
export const FIXABLE_RULE_IDS = jsxRules.map((r) => r.id);

const FIXABLE_SET = new Set<string>(FIXABLE_RULE_IDS);

export type FixableRuleId = (typeof FIXABLE_RULE_IDS)[number];

export function isFixableRuleId(ruleId: string): boolean {
  return FIXABLE_SET.has(ruleId);
}

export function getFixableRuleIds(): string[] {
  return [...FIXABLE_RULE_IDS];
}
