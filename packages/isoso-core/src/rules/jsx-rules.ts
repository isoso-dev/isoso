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

function inputType(element: JsxElementContext): string | undefined {
  return attrString(element.attributes, "type");
}

function isHeadingTag(tag: string): boolean {
  return /^h[1-6]$/i.test(tag);
}

function hasAccessibleName(
  attrs: JsxElementContext["attributes"],
  hasChildrenText: boolean,
): boolean {
  const label = attrString(attrs, "aria-label");
  if (label && label.trim().length > 0) return true;
  if (attrString(attrs, "aria-labelledby")) return true;
  return hasChildrenText;
}

function classNameIncludesOutlineReset(attrs: JsxElementContext["attributes"]): boolean {
  const cn = attrString(attrs, "className") ?? "";
  return /\boutline-none\b/.test(cn) || /\boutline-0\b/.test(cn);
}

/** Resolve rule at scan time (safe inside `check` callbacks). */
function findingFor(
  ruleId: string,
  element: JsxElementContext,
  message: string,
  fixHint?: string,
): Finding {
  const rule = jsxRules.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`Rule not found: ${ruleId}`);
  return findingFromRule(rule, element, message, fixHint);
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
        return findingFor(
          "img-missing-alt",
          element,
          "<img> is missing an alt attribute.",
          'Add alt="..." describing the image, or alt="" if decorative.',
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
      return findingFor(
        "interactive-without-role",
        element,
        `<${element.tagName}> has onClick but no accessible role.`,
        'Use <button>, or add role="button", tabIndex={0}, and onKeyDown for Enter/Space.',
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
      return findingFor(
        "button-missing-name",
        element,
        "<button> has no visible text or aria-label.",
        "Add button text, aria-label, or aria-labelledby.",
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
        return findingFor(
          "input-missing-label",
          element,
          "Placeholder is not a substitute for a label.",
          'Add <label htmlFor="..."> or aria-label.',
        );
      }
      return findingFor(
        "input-missing-label",
        element,
        "Form control is missing a label association.",
        'Add id + <label htmlFor="id">, or aria-label.',
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
        return findingFor(
          "anchor-without-href-or-name",
          element,
          "<a> is missing href.",
          "Use href for navigation or a <button> for actions.",
        );
      }
      if (!element.hasChildrenText && !ariaLabel) {
        return findingFor(
          "anchor-without-href-or-name",
          element,
          "Link has no discernible text.",
          "Add link text or aria-label.",
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
      return findingFor(
        "positive-tabindex",
        element,
        `tabIndex={${n}} creates a confusing focus order.`,
        "Use tabIndex={0} or rely on natural DOM order.",
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
      return findingFor(
        "autofocus-usage",
        element,
        "autoFocus moves focus on page load.",
        "Avoid autoFocus unless the flow is intentionally single-field.",
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
        return findingFor(
          "aria-hidden-on-focusable",
          element,
          "Focusable element uses aria-hidden.",
          "Remove aria-hidden or use inert / remove from tab order.",
        );
      }
      return null;
    },
  },
  {
    id: "svg-missing-accessible-name",
    name: "SVG missing accessible name",
    description: "Informative SVGs need a name for assistive technology.",
    wcag: ["1.1.1 Non-text Content", "4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      if (element.tagName !== "svg" && element.tagName !== "Svg") return null;
      if (hasTruthyAttr(element.attributes, "aria-hidden")) return null;
      const role = attrString(element.attributes, "role");
      if (role === "presentation" || role === "none") return null;
      if (attrString(element.attributes, "aria-label")) return null;
      if (attrString(element.attributes, "aria-labelledby")) return null;
      if (element.hasChildrenText) return null;
      return findingFor(
        "svg-missing-accessible-name",
        element,
        "<svg> has no accessible name.",
        'Add aria-label, aria-labelledby, visible text, or aria-hidden="true" if decorative.',
      );
    },
  },
  {
    id: "iframe-missing-title",
    name: "Iframe missing title",
    description: "Iframes must have a title describing their content.",
    wcag: ["2.4.1 Bypass Blocks", "4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      if (element.tagName !== "iframe" && element.tagName !== "Iframe") return null;
      const title = attrString(element.attributes, "title");
      if (title && title.trim().length > 0) return null;
      return findingFor(
        "iframe-missing-title",
        element,
        "<iframe> is missing a title attribute.",
        'Add title="Description of embedded content".',
      );
    },
  },
  {
    id: "input-image-missing-alt",
    name: "Image input missing alt",
    description: "Input type image requires alt text.",
    wcag: ["1.1.1 Non-text Content"],
    severity: "critical",
    check(element) {
      if (element.tagName !== "input" && element.tagName !== "Input") return null;
      const type = attrString(element.attributes, "type");
      if (type !== "image") return null;
      if (attrString(element.attributes, "alt")) return null;
      return findingFor(
        "input-image-missing-alt",
        element,
        '<input type="image"> is missing alt text.',
        'Add alt="Description of the button action".',
      );
    },
  },
  {
    id: "click-without-keyboard-handler",
    name: "Click handler without keyboard equivalent",
    description: "Custom click targets should support keyboard activation.",
    wcag: ["2.1.1 Keyboard"],
    severity: "serious",
    check(element) {
      const native = new Set(["button", "Button", "a", "Link", "input", "Input"]);
      if (native.has(element.tagName)) return null;
      if (!element.eventHandlers.includes("onClick")) return null;
      const hasKey =
        element.eventHandlers.includes("onKeyDown") ||
        element.eventHandlers.includes("onKeyUp") ||
        element.eventHandlers.includes("onKeyPress");
      if (hasKey) return null;
      return findingFor(
        "click-without-keyboard-handler",
        element,
        `<${element.tagName}> has onClick but no keyboard handler.`,
        "Add onKeyDown for Enter/Space, or use a native <button> or <a>.",
      );
    },
  },
  {
    id: "role-button-missing-tabindex",
    name: "role=button without tab focus",
    description: "Elements with role button must be keyboard focusable.",
    wcag: ["2.1.1 Keyboard", "4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      if (element.tagName === "button" || element.tagName === "Button") return null;
      const role = attrString(element.attributes, "role");
      if (role !== "button") return null;
      const tabIndex = attrString(element.attributes, "tabIndex");
      if (tabIndex === "0" || tabIndex === "-1") return null;
      return findingFor(
        "role-button-missing-tabindex",
        element,
        'role="button" without tabIndex={0}.',
        "Add tabIndex={0} and keyboard handlers, or use <button>.",
      );
    },
  },
  {
    id: "target-blank-without-rel",
    name: "target=_blank without rel",
    description: "Links that open new tabs should use rel noopener (and usually noreferrer).",
    wcag: ["3.2.2 On Input"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "a" && element.tagName !== "Link") return null;
      const target = attrString(element.attributes, "target");
      if (!target || !target.toLowerCase().includes("_blank")) return null;
      const rel = (attrString(element.attributes, "rel") ?? "").toLowerCase();
      if (rel.includes("noopener") && rel.includes("noreferrer")) return null;
      if (rel.includes("noopener")) return null;
      return findingFor(
        "target-blank-without-rel",
        element,
        'Link uses target="_blank" without rel="noopener noreferrer".',
        'Add rel="noopener noreferrer" for security and predictable behavior.',
      );
    },
  },
  {
    id: "heading-empty",
    name: "Empty heading",
    description: "Headings must describe the section that follows.",
    wcag: ["2.4.6 Headings and Labels", "1.3.1 Info and Relationships"],
    severity: "serious",
    check(element) {
      if (!isHeadingTag(element.tagName)) return null;
      if (hasAccessibleName(element.attributes, element.hasChildrenText)) return null;
      return findingFor(
        "heading-empty",
        element,
        `<${element.tagName}> has no accessible text.`,
        "Add heading text or aria-label.",
      );
    },
  },
  {
    id: "label-without-htmlfor",
    name: "Label missing htmlFor",
    description: "Labels should be associated with a control via htmlFor or nesting.",
    wcag: ["1.3.1 Info and Relationships", "3.3.2 Labels or Instructions"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "label" && element.tagName !== "Label") return null;
      if (attrString(element.attributes, "htmlFor")) return null;
      return findingFor(
        "label-without-htmlfor",
        element,
        "<label> is missing htmlFor.",
        "Add htmlFor matching the control id, or wrap the input.",
      );
    },
  },
  {
    id: "link-empty-hash",
    name: "Placeholder hash link",
    description: "Links with href # often need a real destination or button semantics.",
    wcag: ["2.4.4 Link Purpose"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "a" && element.tagName !== "Link") return null;
      const href = attrString(element.attributes, "href");
      if (href !== "#" && href !== "") return null;
      if (element.eventHandlers.includes("onClick")) return null;
      return findingFor(
        "link-empty-hash",
        element,
        'Link uses href="#" without an action handler.',
        "Use a real URL, a button, or onClick with keyboard support.",
      );
    },
  },
  {
    id: "role-link-missing-tabindex",
    name: "role=link without focus",
    description: "Custom links must be focusable and have navigation semantics.",
    wcag: ["2.1.1 Keyboard", "4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      if (element.tagName === "a" || element.tagName === "Link") return null;
      if (attrString(element.attributes, "role") !== "link") return null;
      if (attrString(element.attributes, "href")) return null;
      const tabIndex = attrString(element.attributes, "tabIndex");
      if (tabIndex === "0") return null;
      return findingFor(
        "role-link-missing-tabindex",
        element,
        'role="link" without href or tabIndex={0}.',
        "Use <a href>, or add tabIndex={0} and keyboard handlers.",
      );
    },
  },
  {
    id: "role-link-missing-href",
    name: "role=link without href",
    description: "Elements with role link should expose href when using native navigation.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "moderate",
    check(element) {
      if (element.tagName === "a" || element.tagName === "Link") return null;
      if (attrString(element.attributes, "role") !== "link") return null;
      if (attrString(element.attributes, "href")) return null;
      if (element.eventHandlers.includes("onClick")) return null;
      return findingFor(
        "role-link-missing-href",
        element,
        'role="link" without href or onClick.',
        "Use <a href> or role=button for in-page actions.",
      );
    },
  },
  {
    id: "dialog-missing-name",
    name: "Dialog missing accessible name",
    description: "Dialogs must be announced with a name.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      const isDialog =
        element.tagName === "dialog" ||
        element.tagName === "Dialog" ||
        attrString(element.attributes, "role") === "dialog";
      if (!isDialog) return null;
      if (hasAccessibleName(element.attributes, element.hasChildrenText)) return null;
      return findingFor(
        "dialog-missing-name",
        element,
        "Dialog is missing an accessible name.",
        "Add aria-label or aria-labelledby referencing the title.",
      );
    },
  },
  {
    id: "nav-missing-label",
    name: "Navigation missing label",
    description: "Nav landmarks should be distinguishable when multiple exist.",
    wcag: ["2.4.1 Bypass Blocks", "4.1.2 Name, Role, Value"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "nav" && element.tagName !== "Nav") return null;
      if (attrString(element.attributes, "aria-label")) return null;
      if (attrString(element.attributes, "aria-labelledby")) return null;
      return findingFor(
        "nav-missing-label",
        element,
        "<nav> has no aria-label.",
        'Add aria-label="Primary" (or similar).',
      );
    },
  },
  {
    id: "aside-missing-label",
    name: "Aside missing label",
    description: "Complementary regions should have an accessible name.",
    wcag: ["1.3.1 Info and Relationships", "4.1.2 Name, Role, Value"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "aside" && element.tagName !== "Aside") return null;
      if (attrString(element.attributes, "aria-label")) return null;
      if (attrString(element.attributes, "aria-labelledby")) return null;
      return findingFor(
        "aside-missing-label",
        element,
        "<aside> has no accessible name.",
        "Add aria-label describing the complementary content.",
      );
    },
  },
  {
    id: "region-missing-label",
    name: "Region missing label",
    description: "role=region must have an accessible name.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "moderate",
    check(element) {
      if (attrString(element.attributes, "role") !== "region") return null;
      if (attrString(element.attributes, "aria-label")) return null;
      if (attrString(element.attributes, "aria-labelledby")) return null;
      return findingFor(
        "region-missing-label",
        element,
        'role="region" without aria-label.',
        "Add aria-label or aria-labelledby.",
      );
    },
  },
  {
    id: "object-missing-alternative",
    name: "Object missing text alternative",
    description: "Object embeds need an accessible name or fallback.",
    wcag: ["1.1.1 Non-text Content"],
    severity: "serious",
    check(element) {
      if (element.tagName !== "object" && element.tagName !== "Object") return null;
      if (hasAccessibleName(element.attributes, element.hasChildrenText)) return null;
      if (attrString(element.attributes, "title")) return null;
      return findingFor(
        "object-missing-alternative",
        element,
        "<object> has no accessible name.",
        "Add title, aria-label, or inner fallback content.",
      );
    },
  },
  {
    id: "embed-missing-title",
    name: "Embed missing title",
    description: "Embed elements should describe embedded content.",
    wcag: ["1.1.1 Non-text Content", "4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      if (element.tagName !== "embed" && element.tagName !== "Embed") return null;
      const title = attrString(element.attributes, "title");
      if (title && title.trim().length > 0) return null;
      if (attrString(element.attributes, "aria-label")) return null;
      return findingFor(
        "embed-missing-title",
        element,
        "<embed> is missing title or aria-label.",
        "Add title or aria-label.",
      );
    },
  },
  {
    id: "audio-missing-controls",
    name: "Audio missing controls",
    description: "Audio should expose user controls unless marked decorative.",
    wcag: ["1.4.2 Audio Control"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "audio" && element.tagName !== "Audio") return null;
      if (hasTruthyAttr(element.attributes, "controls")) return null;
      if (hasTruthyAttr(element.attributes, "aria-hidden")) return null;
      return findingFor(
        "audio-missing-controls",
        element,
        "<audio> is missing controls.",
        "Add controls attribute or hide decorative audio from AT.",
      );
    },
  },
  {
    id: "video-missing-controls",
    name: "Video missing controls",
    description: "Video should expose controls for playback.",
    wcag: ["1.4.2 Audio Control"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "video" && element.tagName !== "Video") return null;
      if (hasTruthyAttr(element.attributes, "controls")) return null;
      if (hasTruthyAttr(element.attributes, "aria-hidden")) return null;
      return findingFor(
        "video-missing-controls",
        element,
        "<video> is missing controls.",
        "Add controls so users can pause playback.",
      );
    },
  },
  {
    id: "video-autoplay-without-muted",
    name: "Autoplay video with sound",
    description: "Autoplaying video can interfere with screen readers.",
    wcag: ["1.4.2 Audio Control"],
    severity: "serious",
    check(element) {
      if (element.tagName !== "video" && element.tagName !== "Video") return null;
      if (!hasTruthyAttr(element.attributes, "autoPlay")) return null;
      if (hasTruthyAttr(element.attributes, "muted")) return null;
      return findingFor(
        "video-autoplay-without-muted",
        element,
        "<video autoPlay> is not muted.",
        "Add muted, provide controls, or remove autoplay.",
      );
    },
  },
  {
    id: "accesskey-usage",
    name: "Accesskey attribute used",
    description: "Access keys can conflict with browser and AT shortcuts.",
    wcag: ["2.1.1 Keyboard"],
    severity: "minor",
    check(element) {
      if (!attrString(element.attributes, "accessKey")) return null;
      return findingFor(
        "accesskey-usage",
        element,
        "accessKey can conflict with assistive technology.",
        "Avoid accessKey unless documented and tested.",
      );
    },
  },
  {
    id: "role-img-missing-label",
    name: "role=img missing label",
    description: "role=img requires an accessible name.",
    wcag: ["1.1.1 Non-text Content", "4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      if (attrString(element.attributes, "role") !== "img") return null;
      if (element.tagName === "img" || element.tagName === "Image") return null;
      if (hasAccessibleName(element.attributes, element.hasChildrenText)) return null;
      return findingFor(
        "role-img-missing-label",
        element,
        'role="img" without accessible name.',
        "Add aria-label or aria-labelledby.",
      );
    },
  },
  {
    id: "th-missing-scope",
    name: "Table header missing scope",
    description: "th elements should declare scope for simple tables.",
    wcag: ["1.3.1 Info and Relationships"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "th" && element.tagName !== "Th") return null;
      if (attrString(element.attributes, "scope")) return null;
      if (attrString(element.attributes, "id")) return null;
      return findingFor(
        "th-missing-scope",
        element,
        "<th> is missing scope.",
        'Add scope="col" or scope="row".',
      );
    },
  },
  {
    id: "fieldset-needs-legend",
    name: "Fieldset should have legend",
    description: "Groups of related inputs need a legend.",
    wcag: ["1.3.1 Info and Relationships", "3.3.2 Labels or Instructions"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "fieldset" && element.tagName !== "Fieldset") return null;
      return findingFor(
        "fieldset-needs-legend",
        element,
        "<fieldset> should include a <legend>.",
        "Add <legend> as the first child describing the group.",
      );
    },
  },
  {
    id: "aria-disabled-link",
    name: "Disabled link pattern",
    description: "Links with aria-disabled should not behave like active links.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "a" && element.tagName !== "Link") return null;
      if (!hasTruthyAttr(element.attributes, "aria-disabled")) return null;
      if (!attrString(element.attributes, "href")) return null;
      return findingFor(
        "aria-disabled-link",
        element,
        "Link uses aria-disabled but still has href.",
        "Remove href, use tabIndex={-1}, or use a button.",
      );
    },
  },
  {
    id: "tabindex-zero-without-role",
    name: "tabIndex=0 on static element",
    description: "Non-interactive elements with tabIndex=0 add confusing focus stops.",
    wcag: ["2.4.3 Focus Order", "4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      const staticTags = new Set(["div", "span", "p", "section", "article", "li"]);
      if (!staticTags.has(element.tagName)) return null;
      if (attrString(element.attributes, "tabIndex") !== "0") return null;
      if (attrString(element.attributes, "role")) return null;
      if (element.eventHandlers.includes("onClick")) return null;
      return findingFor(
        "tabindex-zero-without-role",
        element,
        `<${element.tagName}> has tabIndex={0} without role or handler.`,
        "Remove tabIndex or use a native interactive element.",
      );
    },
  },
  {
    id: "outline-none-utility",
    name: "Outline removed in className",
    description: "Removing outline without a visible focus replacement hurts keyboard users.",
    wcag: ["2.4.7 Focus Visible"],
    severity: "serious",
    check(element) {
      if (!classNameIncludesOutlineReset(element.attributes)) return null;
      const cn = attrString(element.attributes, "className") ?? "";
      if (/focus-visible:|focus:|ring-/.test(cn)) return null;
      return findingFor(
        "outline-none-utility",
        element,
        "className removes outline without an obvious focus replacement.",
        "Use focus-visible:ring or equivalent visible focus styles.",
      );
    },
  },
  {
    id: "aria-label-empty",
    name: "Empty aria-label",
    description: "aria-label must not be empty.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      const label = attrString(element.attributes, "aria-label");
      if (label === undefined) return null;
      if (label.trim().length > 0) return null;
      return findingFor(
        "aria-label-empty",
        element,
        "aria-label is empty.",
        "Provide meaningful aria-label text or remove the attribute.",
      );
    },
  },
  {
    id: "input-submit-missing-value",
    name: "Submit input missing value",
    description: "Input type submit/button should have a value or label.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "input" && element.tagName !== "Input") return null;
      const type = attrString(element.attributes, "type") ?? "text";
      if (type !== "submit" && type !== "button" && type !== "reset") return null;
      if (attrString(element.attributes, "value")) return null;
      if (attrString(element.attributes, "aria-label")) return null;
      return findingFor(
        "input-submit-missing-value",
        element,
        `<input type="${type}"> is missing value or aria-label.`,
        "Add value= or aria-label.",
      );
    },
  },
  {
    id: "button-missing-type",
    name: "Button missing type attribute",
    description: "Buttons default to submit inside forms; set type explicitly.",
    wcag: ["3.2.2 On Input", "4.1.2 Name, Role, Value"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "button" && element.tagName !== "Button") return null;
      if (attrString(element.attributes, "type")) return null;
      return findingFor(
        "button-missing-type",
        element,
        "<button> is missing a type attribute.",
        'Add type="button" for actions or type="submit" for form submit.',
      );
    },
  },
  {
    id: "img-alt-whitespace",
    name: "Image alt is whitespace only",
    description: "Whitespace-only alt is treated as missing meaningful text.",
    wcag: ["1.1.1 Non-text Content"],
    severity: "serious",
    check(element) {
      if (element.tagName !== "img" && element.tagName !== "Image") return null;
      const alt = attrString(element.attributes, "alt");
      if (alt === undefined) return null;
      if (alt.trim().length > 0) return null;
      if (hasTruthyAttr(element.attributes, "aria-hidden")) return null;
      return findingFor(
        "img-alt-whitespace",
        element,
        "<img> alt is empty or whitespace-only.",
        'Use meaningful alt text or alt="" only if decorative.',
      );
    },
  },
  {
    id: "dialog-missing-aria-modal",
    name: "Dialog missing aria-modal",
    description: "Modal dialogs should expose aria-modal to assistive tech.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      const isDialog =
        element.tagName === "dialog" ||
        element.tagName === "Dialog" ||
        attrString(element.attributes, "role") === "dialog";
      if (!isDialog) return null;
      if (hasTruthyAttr(element.attributes, "aria-modal")) return null;
      return findingFor(
        "dialog-missing-aria-modal",
        element,
        "Dialog is missing aria-modal={true}.",
        "Add aria-modal={true} on modal dialog surfaces.",
      );
    },
  },
  {
    id: "aria-expanded-without-controls",
    name: "aria-expanded without aria-controls",
    description: "Expandable controls should reference controlled content.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "moderate",
    check(element) {
      if (!hasTruthyAttr(element.attributes, "aria-expanded")) return null;
      if (attrString(element.attributes, "aria-controls")) return null;
      return findingFor(
        "aria-expanded-without-controls",
        element,
        "aria-expanded is set without aria-controls.",
        "Add aria-controls pointing at the expandable region id.",
      );
    },
  },
  {
    id: "aria-labelledby-empty",
    name: "Empty aria-labelledby",
    description: "aria-labelledby must reference element ids.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      const v = attrString(element.attributes, "aria-labelledby");
      if (v === undefined) return null;
      if (v.trim().length > 0) return null;
      return findingFor(
        "aria-labelledby-empty",
        element,
        "aria-labelledby is empty.",
        "Reference id(s) of labelling elements or remove the attribute.",
      );
    },
  },
  {
    id: "aria-describedby-empty",
    name: "Empty aria-describedby",
    description: "aria-describedby must reference element ids.",
    wcag: ["4.1.2 Name, Role, Value"],
    severity: "serious",
    check(element) {
      const v = attrString(element.attributes, "aria-describedby");
      if (v === undefined) return null;
      if (v.trim().length > 0) return null;
      return findingFor(
        "aria-describedby-empty",
        element,
        "aria-describedby is empty.",
        "Reference help text element id(s) or remove the attribute.",
      );
    },
  },
  {
    id: "input-email-autocomplete-missing",
    name: "Email input missing autocomplete",
    description: "Email fields benefit from autocomplete for usability and WCAG 2.2.",
    wcag: ["3.3.8 Accessible Authentication", "1.3.5 Identify Input Purpose"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "input" && element.tagName !== "Input") return null;
      if (inputType(element) !== "email") return null;
      if (attrString(element.attributes, "autoComplete")) return null;
      return findingFor(
        "input-email-autocomplete-missing",
        element,
        "Email input is missing autoComplete.",
        'Add autoComplete="email" or "username".',
      );
    },
  },
  {
    id: "input-password-autocomplete-missing",
    name: "Password input missing autocomplete",
    description: "Password fields should declare autocomplete.",
    wcag: ["3.3.8 Accessible Authentication", "1.3.5 Identify Input Purpose"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "input" && element.tagName !== "Input") return null;
      if (inputType(element) !== "password") return null;
      if (attrString(element.attributes, "autoComplete")) return null;
      return findingFor(
        "input-password-autocomplete-missing",
        element,
        "Password input is missing autoComplete.",
        'Add autoComplete="current-password" or "new-password".',
      );
    },
  },
  {
    id: "link-title-only",
    name: "Link relies on title only",
    description: "Visible link text is required; title alone is insufficient.",
    wcag: ["2.4.4 Link Purpose", "4.1.2 Name, Role, Value"],
    severity: "moderate",
    check(element) {
      if (element.tagName !== "a" && element.tagName !== "Link") return null;
      if (element.hasChildrenText || attrString(element.attributes, "aria-label")) return null;
      if (!attrString(element.attributes, "title")) return null;
      return findingFor(
        "link-title-only",
        element,
        "Link uses title but has no discernible text.",
        "Add visible link text; do not rely on title alone.",
      );
    },
  },
  {
    id: "audio-autoplay-without-controls",
    name: "Autoplay audio without controls",
    description: "Autoplaying audio must be controllable.",
    wcag: ["1.4.2 Audio Control"],
    severity: "serious",
    check(element) {
      if (element.tagName !== "audio" && element.tagName !== "Audio") return null;
      if (!hasTruthyAttr(element.attributes, "autoPlay")) return null;
      if (hasTruthyAttr(element.attributes, "controls")) return null;
      return findingFor(
        "audio-autoplay-without-controls",
        element,
        "<audio autoPlay> is missing controls.",
        "Add controls or remove autoplay.",
      );
    },
  },
  {
    id: "blink-marquee-element",
    name: "Blink or marquee element",
    description: "Moving/blinking content needs user control.",
    wcag: ["2.2.2 Pause, Stop, Hide"],
    severity: "serious",
    check(element) {
      const tag = element.tagName.toLowerCase();
      if (tag !== "marquee" && tag !== "blink") return null;
      return findingFor(
        "blink-marquee-element",
        element,
        "Avoid blink/marquee elements.",
        "Use CSS animations with prefers-reduced-motion and user controls.",
      );
    },
  },
  {
    id: "html-lang-empty",
    name: "Html lang empty",
    description: "Language attribute must have a valid value.",
    wcag: ["3.1.1 Language of Page"],
    severity: "serious",
    check(element) {
      if (element.tagName !== "html") return null;
      const lang = attrString(element.attributes, "lang");
      if (lang === undefined) return null;
      if (lang.trim().length > 0) return null;
      return findingFor(
        "html-lang-empty",
        element,
        "<html lang> is empty.",
        'Set lang="en" or the correct BCP 47 language tag.',
      );
    },
  },
  {
    id: "table-missing-caption",
    name: "Table missing caption",
    description: "Data tables should include a caption.",
    wcag: ["1.3.1 Info and Relationships"],
    severity: "moderate",
    check: () => null,
  },
  {
    id: "video-missing-captions-track",
    name: "Video missing captions track",
    description: "Prerecorded video should provide captions.",
    wcag: ["1.2.2 Captions (Prerecorded)"],
    severity: "moderate",
    check: () => null,
  },
  {
    id: "meta-http-equiv-refresh",
    name: "Meta refresh",
    description: "Timed redirects disorient users.",
    wcag: ["2.2.1 Timing Adjustable", "2.2.2 Pause, Stop, Hide"],
    severity: "serious",
    check: () => null,
  },
  {
    id: "meta-viewport-zoom-lock",
    name: "Viewport prevents zoom",
    description: "Users must be able to zoom the page.",
    wcag: ["1.4.4 Resize Text", "1.4.10 Reflow"],
    severity: "serious",
    check: () => null,
  },
  {
    id: "heading-level-skip",
    name: "Skipped heading level",
    description: "Heading levels should not skip (e.g. h1 to h3).",
    wcag: ["2.4.6 Headings and Labels", "1.3.1 Info and Relationships"],
    severity: "moderate",
    check: () => null,
  },
  {
    id: "multiple-h1",
    name: "Multiple h1 elements",
    description: "Prefer one h1 per document or view.",
    wcag: ["2.4.6 Headings and Labels"],
    severity: "moderate",
    check: () => null,
  },
  {
    id: "multiple-main-landmarks",
    name: "Multiple main landmarks",
    description: "Documents should have one main landmark.",
    wcag: ["2.4.1 Bypass Blocks"],
    severity: "moderate",
    check: () => null,
  },
  {
    id: "html-missing-lang",
    name: "Html missing lang",
    description: "Page language must be declared.",
    wcag: ["3.1.1 Language of Page"],
    severity: "serious",
    check: () => null,
  },
];

export function getRuleById(id: string): Rule | undefined {
  return jsxRules.find((r) => r.id === id);
}
