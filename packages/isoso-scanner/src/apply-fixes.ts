import { parse, parseExpression } from "@babel/parser";
import * as t from "@babel/types";
import { createRequire } from "node:module";
import type { Finding } from "@isoso/core";
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

function findAttrIndex(opening: t.JSXOpeningElement, name: string): number {
  return opening.attributes.findIndex(
    (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === name,
  );
}

function hasAttr(opening: t.JSXOpeningElement, name: string): boolean {
  return findAttrIndex(opening, name) >= 0;
}

function attrStringValue(opening: t.JSXOpeningElement, name: string): string | undefined {
  const idx = findAttrIndex(opening, name);
  if (idx < 0) return undefined;
  const attr = opening.attributes[idx];
  if (!t.isJSXAttribute(attr)) return undefined;
  const v = attr.value;
  if (v === null) return "";
  if (t.isStringLiteral(v)) return v.value;
  if (t.isJSXExpressionContainer(v)) {
    const ex = v.expression;
    if (t.isStringLiteral(ex)) return ex.value;
    if (t.isNumericLiteral(ex)) return String(ex.value);
  }
  return undefined;
}

function removeAttr(opening: t.JSXOpeningElement, name: string): boolean {
  const idx = findAttrIndex(opening, name);
  if (idx < 0) return false;
  opening.attributes.splice(idx, 1);
  return true;
}

function addStringAttr(opening: t.JSXOpeningElement, name: string, value: string): void {
  if (hasAttr(opening, name)) return;
  opening.attributes.push(
    t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value)),
  );
}

function setStringAttr(opening: t.JSXOpeningElement, name: string, value: string): void {
  removeAttr(opening, name);
  addStringAttr(opening, name, value);
}

function addBooleanAttr(opening: t.JSXOpeningElement, name: string): void {
  if (hasAttr(opening, name)) return;
  opening.attributes.push(t.jsxAttribute(t.jsxIdentifier(name), null));
}

function setJsxExpressionAttr(
  opening: t.JSXOpeningElement,
  name: string,
  expressionSource: string,
): void {
  removeAttr(opening, name);
  const expr = parseExpression(expressionSource, { plugins: ["jsx", "typescript"] });
  opening.attributes.push(
    t.jsxAttribute(t.jsxIdentifier(name), t.jsxExpressionContainer(expr)),
  );
}

function eventHandlerNames(opening: t.JSXOpeningElement): string[] {
  const names: string[] = [];
  for (const attr of opening.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
    const n = attr.name.name;
    if (n.startsWith("on") && n.length > 2 && n[2] === n[2]?.toUpperCase()) {
      names.push(n);
    }
  }
  return names;
}

function inputType(opening: t.JSXOpeningElement): string | undefined {
  return attrStringValue(opening, "type");
}

function inputTypeImage(opening: t.JSXOpeningElement): boolean {
  return inputType(opening)?.toLowerCase() === "image";
}

function addKeyboardClickHandler(opening: t.JSXOpeningElement): void {
  if (eventHandlerNames(opening).some((n) => n === "onKeyDown" || n === "onKeyUp")) return;
  setJsxExpressionAttr(
    opening,
    "onKeyDown",
    `(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget?.click?.(); } }`,
  );
}

function addInteractiveButtonPattern(opening: t.JSXOpeningElement): void {
  if (!hasAttr(opening, "role")) addStringAttr(opening, "role", "button");
  if (!hasAttr(opening, "tabIndex")) setJsxExpressionAttr(opening, "tabIndex", "0");
  addKeyboardClickHandler(opening);
}

function findingsAtLine(findings: Finding[], line: number, allowed?: Set<string>): Finding[] {
  return findings.filter(
    (f) => f.line === line && (!allowed || allowed.has(f.ruleId)),
  );
}

function applyRuleFix(
  ruleId: string,
  opening: t.JSXOpeningElement,
  tag: string,
  record: (id: string, line: number, desc: string) => void,
  line: number,
): void {
  switch (ruleId) {
    case "img-missing-alt":
      if (tag !== "img" && tag !== "Image") return;
      if (hasAttr(opening, "alt")) return;
      addStringAttr(opening, "alt", "");
      record(ruleId, line, 'Added alt="" — replace with descriptive text if not decorative.');
      return;
    case "input-image-missing-alt":
      if (tag !== "input" && tag !== "Input") return;
      if (!inputTypeImage(opening) || hasAttr(opening, "alt")) return;
      addStringAttr(opening, "alt", "Submit");
      record(ruleId, line, 'Added alt="Submit" on input type="image".');
      return;
    case "html-missing-lang":
      if (tag !== "html") return;
      if (hasAttr(opening, "lang")) return;
      addStringAttr(opening, "lang", "en");
      record(ruleId, line, 'Added lang="en".');
      return;
    case "iframe-missing-title":
      if (tag !== "iframe" && tag !== "Iframe") return;
      if (hasAttr(opening, "title")) return;
      addStringAttr(opening, "title", "Embedded content");
      record(ruleId, line, 'Added title="Embedded content".');
      return;
    case "interactive-without-role":
      addInteractiveButtonPattern(opening);
      record(ruleId, line, 'Added role="button", tabIndex={0}, and onKeyDown for keyboard activation.');
      return;
    case "button-missing-name":
      if (tag !== "button" && tag !== "Button") return;
      addStringAttr(opening, "aria-label", "Button");
      record(ruleId, line, 'Added aria-label="Button" — replace with specific label text.');
      return;
    case "input-missing-label": {
      if (!["input", "textarea", "select", "Input", "Textarea", "Select"].includes(tag)) return;
      const ph = attrStringValue(opening, "placeholder");
      addStringAttr(opening, "aria-label", ph?.trim() || "Field");
      record(ruleId, line, "Added aria-label (from placeholder when available).");
      return;
    }
    case "anchor-without-href-or-name":
      if (tag !== "a" && tag !== "Link") return;
      if (!attrStringValue(opening, "href") && !eventHandlerNames(opening).includes("onClick")) {
        setStringAttr(opening, "href", "#");
        addKeyboardClickHandler(opening);
        record(ruleId, line, 'Added href="#" and keyboard handler — prefer a real URL or <button>.');
        return;
      }
      addStringAttr(opening, "aria-label", "Link");
      record(ruleId, line, 'Added aria-label="Link".');
      return;
    case "positive-tabindex":
      setJsxExpressionAttr(opening, "tabIndex", "0");
      record(ruleId, line, "Set tabIndex={0}.");
      return;
    case "autofocus-usage":
      if (removeAttr(opening, "autoFocus")) {
        record(ruleId, line, "Removed autoFocus.");
      }
      return;
    case "aria-hidden-on-focusable":
      if (removeAttr(opening, "aria-hidden")) {
        record(ruleId, line, "Removed aria-hidden from focusable element.");
      }
      return;
    case "svg-missing-accessible-name":
      if (tag !== "svg" && tag !== "Svg") return;
      addStringAttr(opening, "aria-hidden", "true");
      record(ruleId, line, 'Marked decorative svg with aria-hidden="true" — use aria-label if informative.');
      return;
    case "click-without-keyboard-handler":
      addKeyboardClickHandler(opening);
      record(ruleId, line, "Added onKeyDown for Enter/Space activation.");
      return;
    case "role-button-missing-tabindex":
      if (attrStringValue(opening, "role") !== "button") return;
      setJsxExpressionAttr(opening, "tabIndex", "0");
      addKeyboardClickHandler(opening);
      record(ruleId, line, "Added tabIndex={0} and onKeyDown.");
      return;
    case "target-blank-without-rel":
      if (tag !== "a" && tag !== "Link") return;
      setStringAttr(opening, "rel", "noopener noreferrer");
      record(ruleId, line, 'Added rel="noopener noreferrer".');
      return;
    case "heading-empty":
      if (!/^h[1-6]$/i.test(tag)) return;
      addStringAttr(opening, "aria-label", "Heading");
      record(ruleId, line, 'Added aria-label="Heading".');
      return;
    case "label-without-htmlfor":
      if (tag !== "label" && tag !== "Label") return;
      addStringAttr(opening, "htmlFor", "isoso-field");
      record(ruleId, line, 'Added htmlFor="isoso-field" — set matching id on the control.');
      return;
    case "link-empty-hash":
      if (tag !== "a" && tag !== "Link") return;
      addInteractiveButtonPattern(opening);
      record(ruleId, line, "Added button-like keyboard pattern for placeholder link.");
      return;
    case "role-link-missing-tabindex":
      setJsxExpressionAttr(opening, "tabIndex", "0");
      addKeyboardClickHandler(opening);
      record(ruleId, line, "Added tabIndex={0} and onKeyDown.");
      return;
    case "role-link-missing-href":
      setStringAttr(opening, "href", "#");
      addKeyboardClickHandler(opening);
      record(ruleId, line, 'Added href="#" and keyboard handler.');
      return;
    case "dialog-missing-name": {
      const isDialog =
        tag === "dialog" ||
        tag === "Dialog" ||
        attrStringValue(opening, "role") === "dialog";
      if (!isDialog) return;
      addStringAttr(opening, "aria-label", "Dialog");
      record(ruleId, line, 'Added aria-label="Dialog".');
      return;
    }
    case "nav-missing-label":
      if (tag !== "nav" && tag !== "Nav") return;
      addStringAttr(opening, "aria-label", "Navigation");
      record(ruleId, line, 'Added aria-label="Navigation".');
      return;
    case "aside-missing-label":
      if (tag !== "aside" && tag !== "Aside") return;
      addStringAttr(opening, "aria-label", "Complementary content");
      record(ruleId, line, 'Added aria-label="Complementary content".');
      return;
    case "region-missing-label":
      if (attrStringValue(opening, "role") !== "region") return;
      addStringAttr(opening, "aria-label", "Region");
      record(ruleId, line, 'Added aria-label="Region".');
      return;
    case "object-missing-alternative":
      if (tag !== "object" && tag !== "Object") return;
      addStringAttr(opening, "title", "Embedded object");
      record(ruleId, line, 'Added title="Embedded object".');
      return;
    case "embed-missing-title":
      if (tag !== "embed" && tag !== "Embed") return;
      addStringAttr(opening, "title", "Embedded content");
      record(ruleId, line, 'Added title="Embedded content".');
      return;
    case "audio-missing-controls":
      if (tag !== "audio" && tag !== "Audio") return;
      addBooleanAttr(opening, "controls");
      record(ruleId, line, "Added controls.");
      return;
    case "video-missing-controls":
      if (tag !== "video" && tag !== "Video") return;
      addBooleanAttr(opening, "controls");
      record(ruleId, line, "Added controls.");
      return;
    case "video-autoplay-without-muted":
      if (tag !== "video" && tag !== "Video") return;
      addBooleanAttr(opening, "muted");
      record(ruleId, line, "Added muted for autoplay video.");
      return;
    case "accesskey-usage":
      if (removeAttr(opening, "accessKey")) {
        record(ruleId, line, "Removed accessKey.");
      }
      return;
    case "role-img-missing-label":
      if (attrStringValue(opening, "role") !== "img") return;
      addStringAttr(opening, "aria-label", "Image");
      record(ruleId, line, 'Added aria-label="Image".');
      return;
    case "th-missing-scope":
      if (tag !== "th" && tag !== "Th") return;
      addStringAttr(opening, "scope", "col");
      record(ruleId, line, 'Added scope="col" — use scope="row" for row headers if needed.');
      return;
    case "aria-disabled-link":
      if (tag !== "a" && tag !== "Link") return;
      if (removeAttr(opening, "href")) {
        setJsxExpressionAttr(opening, "tabIndex", "-1");
        record(ruleId, line, "Removed href and set tabIndex={-1} on disabled link.");
      }
      return;
    case "tabindex-zero-without-role":
      removeAttr(opening, "tabIndex");
      record(ruleId, line, "Removed tabIndex={0} from static element.");
      return;
    case "outline-none-utility": {
      const cn = attrStringValue(opening, "className") ?? "";
      if (/focus-visible:|focus:|ring-/.test(cn)) return;
      const next = `${cn} focus-visible:ring-2 focus-visible:ring-offset-2`.trim();
      setStringAttr(opening, "className", next);
      record(ruleId, line, "Appended Tailwind-style focus-visible ring utilities to className.");
      return;
    }
    case "aria-label-empty":
      removeAttr(opening, "aria-label");
      record(ruleId, line, "Removed empty aria-label.");
      return;
    case "input-submit-missing-value":
      if (tag !== "input" && tag !== "Input") return;
      addStringAttr(opening, "value", "Submit");
      record(ruleId, line, 'Added value="Submit".');
      return;
    case "multiple-h1":
      if (tag.toLowerCase() !== "h1") return;
      opening.name = t.jsxIdentifier("h2");
      record(ruleId, line, "Changed duplicate <h1> to <h2> — review heading outline.");
      return;
    case "multiple-main-landmarks":
      if (tag !== "main" && tag !== "Main") return;
      opening.name = t.jsxIdentifier("section");
      record(ruleId, line, "Changed duplicate <main> to <section> — keep one main landmark.");
      return;
    case "button-missing-type":
      if (tag !== "button" && tag !== "Button") return;
      addStringAttr(opening, "type", "button");
      record(ruleId, line, 'Added type="button".');
      return;
    case "img-alt-whitespace":
      if (tag !== "img" && tag !== "Image") return;
      setStringAttr(opening, "alt", "");
      record(ruleId, line, 'Set alt="" — add descriptive text if not decorative.');
      return;
    case "dialog-missing-aria-modal":
      setJsxExpressionAttr(opening, "aria-modal", "true");
      record(ruleId, line, "Added aria-modal={true}.");
      return;
    case "aria-expanded-without-controls":
      addStringAttr(opening, "aria-controls", "isoso-controlled-region");
      record(ruleId, line, 'Added aria-controls="isoso-controlled-region" — wire to real id.');
      return;
    case "aria-labelledby-empty":
      removeAttr(opening, "aria-labelledby");
      record(ruleId, line, "Removed empty aria-labelledby.");
      return;
    case "aria-describedby-empty":
      removeAttr(opening, "aria-describedby");
      record(ruleId, line, "Removed empty aria-describedby.");
      return;
    case "input-email-autocomplete-missing":
      if (tag !== "input" && tag !== "Input") return;
      addStringAttr(opening, "autoComplete", "email");
      record(ruleId, line, 'Added autoComplete="email".');
      return;
    case "input-password-autocomplete-missing":
      if (tag !== "input" && tag !== "Input") return;
      addStringAttr(opening, "autoComplete", "current-password");
      record(ruleId, line, 'Added autoComplete="current-password".');
      return;
    case "link-title-only": {
      const title = attrStringValue(opening, "title") ?? "Link";
      addStringAttr(opening, "aria-label", title);
      record(ruleId, line, "Added aria-label from title — prefer visible link text.");
      return;
    }
    case "audio-autoplay-without-controls":
      if (tag !== "audio" && tag !== "Audio") return;
      addBooleanAttr(opening, "controls");
      record(ruleId, line, "Added controls on autoplay audio.");
      return;
    case "html-lang-empty":
      if (tag !== "html") return;
      setStringAttr(opening, "lang", "en");
      record(ruleId, line, 'Set lang="en".');
      return;
    default:
      return;
  }
}

export function applyFixesToSource(
  source: string,
  findings: Finding[],
  allowedRuleIds?: Set<string>,
): ApplyFixesResult {
  if (findings.length === 0) {
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

  const fieldsetLines = new Set(
    findings.filter((f) => f.ruleId === "fieldset-needs-legend").map((f) => f.line),
  );

  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const opening = path.node;
      const line = opening.loc?.start.line;
      if (!line) return;
      const atLine = findingsAtLine(findings, line, allowedRuleIds);
      if (atLine.length === 0) return;

      const tag = getTagName(opening);
      const ruleIds = [...new Set(atLine.map((f) => f.ruleId))];
      for (const ruleId of ruleIds) {
        applyRuleFix(ruleId, opening, tag, record, line);
      }
    },
    JSXElement(path: NodePath<t.JSXElement>) {
      const opening = path.node.openingElement;
      const line = opening.loc?.start.line;
      if (!line || !fieldsetLines.has(line)) return;
      const tag = getTagName(opening);
      if (tag !== "fieldset" && tag !== "Fieldset") return;
      const hasLegend = path.node.children.some((child) => {
        if (!t.isJSXElement(child)) return false;
        return getTagName(child.openingElement).toLowerCase() === "legend";
      });
      if (hasLegend) return;
      path.node.children.unshift(
        t.jsxText("\n        "),
        t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier("legend"), []),
          t.jsxClosingElement(t.jsxIdentifier("legend")),
          [t.jsxText("Form group")],
          false,
        ),
        t.jsxText("\n        "),
      );
      record("fieldset-needs-legend", line, "Inserted <legend>Form group</legend> as first child.");
    },
  });

  if (applied.length === 0) {
    return { source, changed: false, applied: [] };
  }

  const { code } = generate(ast, { retainLines: true }, source);
  return { source: code ?? source, changed: true, applied };
}
