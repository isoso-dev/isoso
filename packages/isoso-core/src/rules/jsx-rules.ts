import type { Finding, JsxElementContext, Rule } from "../types.js";

function findingFromRule(
  rule: Rule,
  element: JsxElementContext,
  message: string,
  fixHint?: string
): Finding {
  return {
    ruleId: rule.id,
    message,
    severity: rule.severity,
    wcag: rule.wcag,
    file: element.file,
    line: element.line,
    column: element.column,
    snippet: element.snippet,
    fixHint,
  };
}

function hasTruthyAttr(attrs: JsxElementContext["attributes"], key: string): boolean {
  const v = attrs[key];
  if (v === true) return true;
  if (typeof v === "string" && v.length > 0 && v !== "false") return true;
  return false;
}

function attrString(attrs: JsxElementContext["attributes"], key: string): string | undefined {
  const v = attrs[key];
  return typeof v === "string" ? v : undefined;
}

export const jsxRules: Rule[] = [
  {
    id: "img-missing-alt",
    name: "Image missing alternative text",
    description: "Images must include meaningful alt text or be marked decorative.",
    wcag: ["1.1.1 Non-text Content"],
    severity: "critical",
    check(element) {
      if (element.tagName !== "img" && element.tagName !== "Image") return null;
      const alt = attrString(element.attributes, "alt");
      const ariaHidden = hasTruthyAttr(element.attributes, "aria-hidden");
      if (ariaHidden) return null;
      if (alt === undefined) {
        return findingFromRule(
          jsxRules[0]!,
          element,
          "<img> is missing an alt attribute.",
          'Add alt="..." describing the image, or alt="" if decorative.'
        );
      }
      return null;
    },
  },
  {
    id: "interactive-without-role",
    name: "Non-interactive element with click handler",
    description: "Elements with click handlers need an appropriate role and keyboard support.",
    wcag: ["4.1.2 Name, Role, Value", "2.1.1 Keyboard"],
    severity: "serious",
    check(element) {
      const staticTags = new Set(["div", "span", "p", "section", "article"]);
      if (!staticTags.has(element.tagName)) return null;
      if (!element.eventHandlers.includes("onClick")) return null;
      const role = attrString(element.attributes, "role");
      const tabIndex = attrString(element.attributes, "tabIndex");
      if (role === "button" || role === "link") return null;
      if (tabIndex === "0" || tabIndex === "-1") {
        if (role) return null;
      }
      return findingFromRule(
        jsxRules[1]!,
        element,
        `<${element.tagName}> has onClick but no accessible role.`,
        'Use <button>, or add role="button", tabIndex={0}, and onKeyDown for Enter/Space.'
      );
    },
  },
  {
    id: "button-missing-name",
    name: "Button missing accessible name",
    description: "Buttons must have discernible text or an aria-label.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      if (element.tagName !== "button" && element.tagName !== "Button") return null;
      const ariaLabel = attrString(element.attributes, "aria-label");
      const ariaLabelledby = attrString(element.attributes, "aria-labelledby");
      if (ariaLabel || ariaLabelledby) return null;
      if (element.hasChildrenText) return null;
      return findingFromRule(
        jsxRules[2]!,
        element,
        "<button> has no visible text or aria-label.",
        "Add button text, aria-label, or aria-labelledby."
      );
    },
  },
  {
    id: "input-missing-label",
    name: "Form control missing label",
    description: "Inputs need an associated label or aria-label.",
    wcag: ["1.3.1 Info and Relationships", "4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      const inputs = new Set(["input", "textarea", "select", "Input", "Textarea", "Select"]);
      if (!inputs.has(element.tagName)) return null;
      const type = attrString(element.attributes, "type");
      if (type === "hidden") return null;
      const ariaLabel = attrString(element.attributes, "aria-label");
      const ariaLabelledby = attrString(element.attributes, "aria-labelledby");
      const id = attrString(element.attributes, "id");
      const placeholder = attrString(element.attributes, "placeholder");
      if (ariaLabel || ariaLabelledby) return null;
      if (id) return null;
      if (placeholder) {
        return findingFromRule(
          jsxRules[3]!,
          element,
          "Placeholder is not a substitute for a label.",
          "Add <label htmlFor=\"...\"> or aria-label."
        );
      }
      return findingFromRule(
        jsxRules[3]!,
        element,
        "Form control is missing a label association.",
        'Add id + <label htmlFor="id">, or aria-label.'
      );
    },
  },
  {
    id: "anchor-without-href-or-name",
    name: "Link missing href or accessible name",
    description: "Links must have href and discernible text.",
    wcag: ["2.4.4 Link Purpose", "4.1.2 Name, Role, Value"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "a" && element.tagName !== "Link") return null;
      const href = attrString(element.attributes, "href");
      const ariaLabel = attrString(element.attributes, "aria-label");
      if (!href && !hasTruthyAttr(element.attributes, "onClick")) {
        return findingFromRule(
          jsxRules[4]!,
          element,
          "<a> is missing href.",
          "Use href for navigation or a <button> for actions."
        );
      }
      if (!element.hasChildrenText && !ariaLabel) {
        return findingFromRule(
          jsxRules[4]!,
          element,
          "Link has no discernible text.",
          "Add link text or aria-label."
        );
      }
      return null;
    },
  },
  {
    id: "positive-tabindex",
    name: "Positive tabindex disrupts focus order",
    description: "tabIndex values greater than 0 harm keyboard navigation.",
    wcag: ["2.4.3 Focus Order"],
    severity: "moderate",
    check(element) {
      const tabIndex = attrString(element.attributes, "tabIndex");
      if (!tabIndex) return null;
      const n = Number.parseInt(tabIndex, 10);
      if (Number.isNaN(n) || n <= 0) return null;
      return findingFromRule(
        jsxRules[5]!,
        element,
        `tabIndex={${n}} creates a confusing focus order.`,
        "Use tabIndex={0} or rely on natural DOM order."
      );
    },
  },
  {
    id: "autofocus-usage",
    name: "Autofocus can disorient users",
    description: "Autofocus moves keyboard focus without user intent.",
    wcag: ["2.4.3 Focus Order"],
    severity: "minor",
    check(element) {
      if (!hasTruthyAttr(element.attributes, "autoFocus")) return null;
      return findingFromRule(
        jsxRules[6]!,
        element,
        "autoFocus moves focus on page load.",
        "Avoid autoFocus unless the flow is intentionally single-field."
      );
    },
  },
  {
    id: "aria-hidden-on-focusable",
    name: "Focusable element hidden from assistive tech",
    description: "aria-hidden must not be used on focusable elements.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      if (!hasTruthyAttr(element.attributes, "aria-hidden")) return null;
      const tabIndex = attrString(element.attributes, "tabIndex");
      const interactive = new Set([
        "a",
        "button",
        "input",
        "select",
        "textarea",
        "Link",
        "Button",
        "Input",
      ]);
      if (
        interactive.has(element.tagName) ||
        tabIndex === "0" ||
        element.eventHandlers.includes("onClick")
      ) {
        return findingFromRule(
          jsxRules[7]!,
          element,
          "Focusable element uses aria-hidden.",
          "Remove aria-hidden or use inert / remove from tab order."
        );
      }
      return null;
    },
  },
];

export function getRuleById(id: string): Rule | undefined {
  return jsxRules.find((r) => r.id === id);
}
