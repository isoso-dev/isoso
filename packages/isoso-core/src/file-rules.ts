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
  const h1Lines: number[] = [];
  const mainLines: number[] = [];
  let lastHeadingLevel = 0;
  const fileHasCaptionTrack = /<track\b[^>]*\bkind\s*=\s*["']captions["']/i.test(source);
  const fileHasTableCaption = /<caption\b/i.test(source);
  let reportedVideoCaptions = false;
  let reportedTableCaption = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i] ?? "";

    if (/<h1\b/i.test(line)) h1Lines.push(lineNum);
    if (/<main\b/i.test(line) || /\brole\s*=\s*["']main["']/i.test(line)) {
      mainLines.push(lineNum);
    }

    const hm = line.match(/<h([1-6])\b/i);
    if (hm) {
      const level = Number.parseInt(hm[1]!, 10);
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        findings.push(
          fileFinding(
            "heading-level-skip",
            file,
            lineNum,
            `Heading level jumps from h${lastHeadingLevel} to h${level}.`,
            "Use sequential heading levels (do not skip).",
          ),
        );
      }
      lastHeadingLevel = level;
    }

    if (/<html\b/i.test(line)) {
      if (!/\blang\s*=/.test(line)) {
        findings.push(
          fileFinding(
            "html-missing-lang",
            file,
            lineNum,
            "<html> is missing a lang attribute.",
            'Add lang="en" (or the page language).',
          ),
        );
      } else if (/\blang\s*=\s*["']\s*["']/.test(line)) {
        findings.push(
          fileFinding(
            "html-lang-empty",
            file,
            lineNum,
            "<html lang> is empty.",
            'Set lang="en" or the correct BCP 47 language tag.',
          ),
        );
      }
    }

    if (/http-equiv\s*=\s*["']refresh["']/i.test(line)) {
      findings.push(
        fileFinding(
          "meta-http-equiv-refresh",
          file,
          lineNum,
          "Meta refresh redirects or reloads the page automatically.",
          "Use server redirects or user-initiated navigation instead.",
        ),
      );
    }

    if (/<meta\b/i.test(line) && /\bname\s*=\s*["']viewport["']/i.test(line)) {
      if (/user-scalable\s*=\s*no/i.test(line) || /maximum-scale\s*=\s*["']?1(\.0)?["']?/.test(line)) {
        findings.push(
          fileFinding(
            "meta-viewport-zoom-lock",
            file,
            lineNum,
            "Viewport meta prevents zoom.",
            "Allow pinch zoom (avoid user-scalable=no and maximum-scale=1).",
          ),
        );
      }
    }

    if (
      /<table\b/i.test(line) &&
      !/\brole\s*=\s*["']presentation["']/i.test(line) &&
      !fileHasTableCaption &&
      !reportedTableCaption
    ) {
      reportedTableCaption = true;
      findings.push(
        fileFinding(
          "table-missing-caption",
          file,
          lineNum,
          "<table> should include a <caption>.",
          "Add <caption> as the first table child.",
        ),
      );
    }

    if (/<video\b/i.test(line) && !fileHasCaptionTrack && !reportedVideoCaptions && !/\baria-hidden\s*=/.test(line)) {
      reportedVideoCaptions = true;
      findings.push(
        fileFinding(
          "video-missing-captions-track",
          file,
          lineNum,
          "<video> has no captions track in this file.",
          'Add <track kind="captions" /> or equivalent captions.',
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
