/** Rule ids that `isoso fix` can apply automatically (static, conservative edits). */
export const FIXABLE_RULE_IDS = [
  "img-missing-alt",
  "input-image-missing-alt",
  "html-missing-lang",
  "iframe-missing-title",
] as const;

export type FixableRuleId = (typeof FIXABLE_RULE_IDS)[number];

const FIXABLE_SET = new Set<string>(FIXABLE_RULE_IDS);

export function isFixableRuleId(ruleId: string): boolean {
  return FIXABLE_SET.has(ruleId);
}

export function getFixableRuleIds(): string[] {
  return [...FIXABLE_RULE_IDS];
}
