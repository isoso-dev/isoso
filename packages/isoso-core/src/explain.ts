import { resolveAiApiKey, resolveAiChatCompletionsUrl, resolveAiModel } from "./ai-config.js";
import { getRuleById } from "./rules/jsx-rules.js";
import type { ExplainOptions, Explanation, Finding } from "./types.js";

const BUILTIN: Record<
  string,
  Omit<Explanation, "source">
> = {
  "img-missing-alt": {
    summary: "Screen readers cannot describe images without alt text.",
    impact: "Users who rely on assistive technology miss meaningful visual information.",
    remediation:
      "Provide concise alt text for informative images. Use alt=\"\" only when the image is purely decorative.",
  },
  "interactive-without-role": {
    summary: "Custom click targets behave like buttons but are not exposed as such.",
    impact: "Keyboard and screen reader users may not discover or activate the control.",
    remediation:
      "Prefer native <button> or <a>. If you must use a div, add role, tabIndex, and keyboard handlers.",
  },
  "button-missing-name": {
    summary: "The button has no accessible name in the accessibility tree.",
    impact: "Screen readers announce a generic 'button' with no context.",
    remediation: "Add visible text, aria-label, or aria-labelledby pointing to descriptive text.",
  },
  "input-missing-label": {
    summary: "The form field is not programmatically associated with a label.",
    impact: "Users may not understand what to enter; autofill and voice control suffer.",
    remediation: "Pair id with <label htmlFor>, or use aria-label / aria-labelledby.",
  },
  "anchor-without-href-or-name": {
    summary: "The link is missing navigation semantics or readable text.",
    impact: "Users cannot predict where the link goes or what it does.",
    remediation: "Use a valid href and descriptive link text. Use buttons for in-page actions.",
  },
  "positive-tabindex": {
    summary: "Positive tabindex overrides natural focus order.",
    impact: "Keyboard users tab through the page in a confusing sequence.",
    remediation: "Remove positive tabindex; fix DOM order or use tabIndex={0} only when needed.",
  },
  "autofocus-usage": {
    summary: "Focus jumps to a field automatically on load.",
    impact: "Can disorient screen reader users and skip important page context.",
    remediation: "Let users initiate focus, or limit autofocus to dedicated single-task flows.",
  },
  "aria-hidden-on-focusable": {
    summary: "An element is hidden from AT but still reachable by keyboard.",
    impact: "Users may focus controls that screen readers cannot announce.",
    remediation: "Do not combine aria-hidden with focusable elements; use inert or disable instead.",
  },
  "svg-missing-accessible-name": {
    summary: "The SVG has no name in the accessibility tree.",
    impact: "Screen reader users cannot understand the purpose of informative graphics.",
    remediation:
      'Use aria-label, aria-labelledby, or title content; use aria-hidden="true" if decorative.',
  },
  "iframe-missing-title": {
    summary: "Embedded frames need a title describing their content.",
    impact: "Users cannot identify what the iframe contains when navigating by landmarks.",
    remediation: 'Add a concise title attribute, e.g. title="Payment form".',
  },
  "input-image-missing-alt": {
    summary: "Image submit buttons use alt text as their accessible name.",
    impact: "The control is announced without purpose if alt is missing.",
    remediation: 'Add alt="Describe the action this button performs".',
  },
  "click-without-keyboard-handler": {
    summary: "Mouse-only activation excludes keyboard users.",
    impact: "The control cannot be operated without a pointer device.",
    remediation: "Handle Enter/Space in onKeyDown, or use a native button or link.",
  },
  "role-button-missing-tabindex": {
    summary: "A custom button is not in the tab order.",
    impact: "Keyboard users cannot reach the control to activate it.",
    remediation: "Add tabIndex={0} with keyboard handlers, or use <button>.",
  },
  "target-blank-without-rel": {
    summary: "New-window links without rel can create security and UX issues.",
    impact: "Users may not realize a new tab opened; reverse tabnabbing is a risk.",
    remediation: 'Add rel="noopener noreferrer" when using target="_blank".',
  },
};

export function explainFindingBuiltin(finding: Finding): Explanation {
  const rule = getRuleById(finding.ruleId);
  const base = BUILTIN[finding.ruleId];
  if (base) {
    return { ...base, source: "builtin" };
  }
  return {
    summary: rule?.description ?? finding.message,
    impact: "This pattern can create barriers for people using assistive technology.",
    remediation: finding.fixHint ?? "Review WCAG guidance for this pattern and update the component.",
    source: "builtin",
  };
}

export async function explainFinding(
  finding: Finding,
  options: ExplainOptions = {}
): Promise<Explanation> {
  if (options.preferBuiltin) {
    return explainFindingBuiltin(finding);
  }

  const apiKey = resolveAiApiKey(options.apiKey);
  if (!apiKey) {
    return explainFindingBuiltin(finding);
  }

  const model = resolveAiModel(options.model);
  const chatUrl = resolveAiChatCompletionsUrl();
  const prompt = `You are an accessibility engineer. Explain this JSX finding briefly.
Rule: ${finding.ruleId}
Message: ${finding.message}
WCAG: ${finding.wcag.join(", ")}
File: ${finding.file}:${finding.line}
Snippet: ${finding.snippet ?? "n/a"}

Respond in JSON with keys: summary, impact, remediation (each 1-2 sentences).`;

  try {
    const res = await fetch(chatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      return explainFindingBuiltin(finding);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return explainFindingBuiltin(finding);
    const parsed = JSON.parse(content) as Omit<Explanation, "source">;
    return { ...parsed, source: "ai" };
  } catch {
    return explainFindingBuiltin(finding);
  }
}
