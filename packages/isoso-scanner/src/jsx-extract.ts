import { parse } from "@babel/parser";
import * as t from "@babel/types";
import { createRequire } from "node:module";
import type { NodePath } from "@babel/traverse";
import type { JsxElementContext } from "@isoso/core";

const require = createRequire(import.meta.url);
const traverseModule = require("@babel/traverse") as {
  default: (parent: t.Node, opts?: object) => void;
};
const traverse = traverseModule.default;

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

function attrValue(node: t.JSXAttribute): string | boolean | undefined {
  const v = node.value;
  if (v === null) return true;
  if (t.isStringLiteral(v)) return v.value;
  if (t.isJSXExpressionContainer(v)) {
    const ex = v.expression;
    if (t.isStringLiteral(ex)) return ex.value;
    if (t.isBooleanLiteral(ex)) return ex.value;
    if (t.isNumericLiteral(ex)) return String(ex.value);
    if (t.isJSXEmptyExpression(ex)) return undefined;
    if (t.isIdentifier(ex)) return ex.name;
    return "{expression}";
  }
  return undefined;
}

function collectAttributes(opening: t.JSXOpeningElement): {
  attributes: Record<string, string | boolean | undefined>;
  eventHandlers: string[];
} {
  const attributes: Record<string, string | boolean | undefined> = {};
  const eventHandlers: string[] = [];
  for (const attr of opening.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
    const name = attr.name.name;
    attributes[name] = attrValue(attr);
    if (name.startsWith("on") && name.length > 2 && name[2] === name[2]?.toUpperCase()) {
      eventHandlers.push(name);
    }
  }
  return { attributes, eventHandlers };
}

function nodeHasTextChild(path: NodePath<t.JSXElement>): boolean {
  let hasText = false;
  path.traverse({
    JSXText(inner) {
      if (inner.node.value.trim().length > 0) hasText = true;
    },
    JSXExpressionContainer(inner) {
      const ex = inner.node.expression;
      if (t.isStringLiteral(ex) && ex.value.trim().length > 0) hasText = true;
    },
  });
  return hasText;
}

function snippetFor(source: string, lineNumber: number): string {
  const lines = source.split("\n");
  const line = lines[lineNumber - 1]?.trim() ?? "";
  if (!line) return `<element line ${lineNumber}>`;
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

export function extractJsxElements(file: string, source: string): JsxElementContext[] {
  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: true,
    });
  } catch {
    return [];
  }

  const elements: JsxElementContext[] = [];

  traverse(ast, {
    JSXElement(path: NodePath<t.JSXElement>) {
      const opening = path.node.openingElement;
      const tagName = getTagName(opening);
      const loc = opening.loc?.start;
      if (!loc) return;
      const { attributes, eventHandlers } = collectAttributes(opening);
      elements.push({
        file,
        tagName,
        line: loc.line,
        column: loc.column + 1,
        attributes,
        hasChildrenText: nodeHasTextChild(path),
        snippet: snippetFor(source, loc.line),
        eventHandlers,
      });
    },
  });

  return elements;
}
