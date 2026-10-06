import { parse } from "@babel/parser";
import * as t from "@babel/types";
import { createRequire } from "node:module";
import { isFixableRuleId, type Finding } from "@isoso/core";
import type { NodePath } from "@babel/traverse";

const require = createRequire(import.meta.url);
const traverseModule = require("@babel/traverse") as {
  default: (parent: t.Node, opts?: object) => void;
};
const traverse = traverseModule.default;
const generate = require("@babel/generator").default as (
  ast: t.Node,
  opts?: { retainLines?: boolean },
  source?: string,
) => { code: string | undefined };

export interface AppliedFix {
  ruleId: string;
  line: number;
  description: string;
}

export interface ApplyFixesResult {
  source: string;
  changed: boolean;
  applied: AppliedFix[];
}

function getTagName(opening: t.JSXOpeningElement): string {
  const n = opening.name;
  if (t.isJSXIdentifier(n)) return n.name;
  if (t.isJSXMemberExpression(n)) {
    const parts: string[] = [];
    let cur: t.JSXMemberExpression | t.JSXIdentifier = n;
    while (t.isJSXMemberExpression(cur)) {
      if (t.isJSXIdentifier(cur.property)) parts.unshift(cur.property.name);
      cur = cur.object as t.JSXMemberExpression | t.JSXIdentifier;
    }
    if (t.isJSXIdentifier(cur)) parts.unshift(cur.name);
    return parts.join(".");
  }
  return "unknown";
}

function hasAttr(opening: t.JSXOpeningElement, name: string): boolean {
  return opening.attributes.some(
    (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === name,
  );
}

function addStringAttr(opening: t.JSXOpeningElement, name: string, value: string): void {
  opening.attributes.push(
    t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value)),
  );
}

function inputTypeImage(opening: t.JSXOpeningElement): boolean {
  for (const attr of opening.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
    if (attr.name.name !== "type") continue;
    const v = attr.value;
    if (v === null) continue;
    if (t.isStringLiteral(v) && v.value.toLowerCase() === "image") return true;
  }
  return false;
}

function findingsAtLine(findings: Finding[], line: number): Finding[] {
  return findings.filter((f) => f.line === line && isFixableRuleId(f.ruleId));
}

export function applyFixesToSource(
  source: string,
  findings: Finding[],
  allowedRuleIds?: Set<string>,
): ApplyFixesResult {
  const fixable = findings.filter(
    (f) => isFixableRuleId(f.ruleId) && (!allowedRuleIds || allowedRuleIds.has(f.ruleId)),
  );
  if (fixable.length === 0) {
    return { source, changed: false, applied: [] };
  }

  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: true,
    });
  } catch {
    return { source, changed: false, applied: [] };
  }

  const applied: AppliedFix[] = [];
  const appliedKeys = new Set<string>();

  const record = (ruleId: string, line: number, description: string) => {
    const key = `${ruleId}:${line}`;
    if (appliedKeys.has(key)) return;
    appliedKeys.add(key);
    applied.push({ ruleId, line, description });
  };

  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const opening = path.node;
      const line = opening.loc?.start.line;
      if (!line) return;
      const atLine = findingsAtLine(fixable, line);
      if (atLine.length === 0) return;

      const tag = getTagName(opening);

      for (const f of atLine) {
        if (f.ruleId === "img-missing-alt") {
          if (tag !== "img" && tag !== "Image") continue;
          if (hasAttr(opening, "alt")) continue;
          addStringAttr(opening, "alt", "");
          record(f.ruleId, line, 'Added alt="" (mark decorative or replace with descriptive text).');
        } else if (f.ruleId === "input-image-missing-alt") {
          if (tag !== "input" || !inputTypeImage(opening)) continue;
          if (hasAttr(opening, "alt")) continue;
          addStringAttr(opening, "alt", "");
          record(f.ruleId, line, 'Added alt="" on input type="image".');
        } else if (f.ruleId === "html-missing-lang") {
          if (tag !== "html") continue;
          if (hasAttr(opening, "lang")) continue;
          addStringAttr(opening, "lang", "en");
          record(f.ruleId, line, 'Added lang="en" (adjust if the page is not English).');
        } else if (f.ruleId === "iframe-missing-title") {
          if (tag !== "iframe") continue;
          if (hasAttr(opening, "title")) continue;
          addStringAttr(opening, "title", "Embedded content");
          record(
            f.ruleId,
            line,
            'Added title="Embedded content" (replace with a specific description).',
          );
        }
      }
    },
  });

  if (applied.length === 0) {
    return { source, changed: false, applied: [] };
  }

  const { code } = generate(ast, { retainLines: true }, source);
  return { source: code ?? source, changed: true, applied };
}
