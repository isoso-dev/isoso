/**
 * Line-based JSX/TSX scan — canonical rule set shared with Isoso Cloud (Deno).
 * Keep in sync via `npm run sync:cloud` in the Isoso CLI repo.
 */

export type LineScanFinding = {
  ruleId: string;
  severity: "critical" | "serious" | "moderate" | "minor";
  message: string;
  file: string;
  line: number;
};

function push(
  out: LineScanFinding[],
  file: string,
  line: number,
  ruleId: string,
  severity: LineScanFinding["severity"],
  message: string,
) {
  out.push({ ruleId, severity, message, file, line });
}

export function scanSourceFile(filePath: string, source: string): LineScanFinding[] {
  const findings: LineScanFinding[] = [];
  const lines = source.split("\n");
  const fileHasCaptionTrack = /<track\b[^>]*\bkind\s*=\s*["']captions["']/i.test(source);
  const fileHasTableCaption = /<caption\b/i.test(source);
  let reportedVideoCaptions = false;
  let reportedTableCaption = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i] ?? "";

    if (/<img\b/i.test(line)) {
      const altMatch = line.match(/\balt\s*=\s*("([^"]*)"|'([^']*)'|\{([^}]*)\})/i);
      if (!altMatch && !/\baria-hidden\s*=/.test(line)) {
        push(findings, filePath, lineNum, "img-missing-alt", "critical", "<img> is missing an alt attribute.");
      } else if (altMatch) {
        const val = (altMatch[2] ?? altMatch[3] ?? altMatch[4] ?? "").trim();
        if (val.length === 0 && !/\baria-hidden\s*=/.test(line)) {
          push(findings, filePath, lineNum, "img-alt-whitespace", "serious", "<img> alt is empty or whitespace-only.");
        }
      }
    }

    if (/<button\b/i.test(line) && !/\btype\s*=/.test(line)) {
      push(
        findings,
        filePath,
        lineNum,
        "button-missing-type",
        "moderate",
        "<button> is missing type (defaults to submit inside forms).",
      );
    }

    if (/<(div|span|p|section|article)\b/i.test(line) && /\bonClick\b/.test(line)) {
      if (!/\brole\s*=\s*["']?(button|link)/.test(line) && !/\btabIndex\s*=/.test(line)) {
        push(
          findings,
          filePath,
          lineNum,
          "interactive-without-role",
          "serious",
          "Element has onClick but no accessible role or tabIndex.",
        );
      }
    }

    if (/<button\b/i.test(line)) {
      const hasName =
        /\baria-label\s*=/.test(line) ||
        /\baria-labelledby\s*=/.test(line) ||
        />[^<]+<\//.test(line);
      if (!hasName && !/<\/button>/.test(line)) {
        push(
          findings,
          filePath,
          lineNum,
          "button-missing-name",
          "serious",
          "<button> may be missing visible text or aria-label.",
        );
      }
    }

    if (/<(input|textarea|select)\b/i.test(line)) {
      if (/\btype\s*=\s*["']hidden["']/.test(line)) continue;
      const hasLabel =
        /\baria-label\s*=/.test(line) ||
        /\baria-labelledby\s*=/.test(line) ||
        /\bid\s*=/.test(line);
      if (!hasLabel) {
        if (/\bplaceholder\s*=/.test(line)) {
          push(
            findings,
            filePath,
            lineNum,
            "input-missing-label",
            "serious",
            "Placeholder is not a substitute for a label.",
          );
        } else {
          push(
            findings,
            filePath,
            lineNum,
            "input-missing-label",
            "serious",
            "Form control is missing a label association.",
          );
        }
      }
      if (/<input\b/i.test(line) && /\btype\s*=\s*["']email["']/.test(line) && !/\bautoComplete\s*=/.test(line)) {
        push(
          findings,
          filePath,
          lineNum,
          "input-email-autocomplete-missing",
          "moderate",
          'Email input should use autoComplete="email" (or username).',
        );
      }
      if (/<input\b/i.test(line) && /\btype\s*=\s*["']password["']/.test(line) && !/\bautoComplete\s*=/.test(line)) {
        push(
          findings,
          filePath,
          lineNum,
          "input-password-autocomplete-missing",
          "moderate",
          'Password input should use autoComplete="current-password" or "new-password".',
        );
      }
    }

    if (/<(a|Link)\b/.test(line)) {
      if (!/\bhref\s*=/.test(line) && !/\bonClick\b/.test(line)) {
        push(findings, filePath, lineNum, "anchor-without-href-or-name", "moderate", "Link is missing href.");
      }
      const hasText = />[^<\s][^<]*<\//.test(line) || /\baria-label\s*=/.test(line);
      const hasTitle = /\btitle\s*=/.test(line);
      if (!hasText && hasTitle && !/\baria-label\s*=/.test(line)) {
        push(
          findings,
          filePath,
          lineNum,
          "link-title-only",
          "moderate",
          "Link uses title but has no discernible text (prefer visible link text).",
        );
      }
    }

    const tabMatch = line.match(/\btabIndex\s*=\s*\{?\s*(\d+)\s*\}?/);
    if (tabMatch && Number.parseInt(tabMatch[1]!, 10) > 0) {
      push(
        findings,
        filePath,
        lineNum,
        "positive-tabindex",
        "moderate",
        `tabIndex={${tabMatch[1]}} disrupts focus order.`,
      );
    }

    if (/\bautoFocus\b/.test(line)) {
      push(findings, filePath, lineNum, "autofocus-usage", "minor", "autoFocus moves focus on load.");
    }

    if (/\baria-hidden\s*=\s*\{?\s*true/.test(line)) {
      if (/<(a|button|input|select|textarea)\b/i.test(line) || /\bonClick\b/.test(line)) {
        push(findings, filePath, lineNum, "aria-hidden-on-focusable", "serious", "Focusable element uses aria-hidden.");
      }
    }

    if (/<svg\b/i.test(line)) {
      if (
        !/\baria-hidden\s*=/.test(line) &&
        !/\baria-label\s*=/.test(line) &&
        !/\baria-labelledby\s*=/.test(line) &&
        !/\brole\s*=\s*["']?(presentation|none)/.test(line)
      ) {
        push(findings, filePath, lineNum, "svg-missing-accessible-name", "serious", "<svg> may be missing an accessible name.");
      }
    }

    if (/<iframe\b/i.test(line) && !/\btitle\s*=/.test(line)) {
      push(findings, filePath, lineNum, "iframe-missing-title", "serious", "<iframe> is missing a title attribute.");
    }

    if (/<input\b/i.test(line) && /\btype\s*=\s*["']image["']/.test(line) && !/\balt\s*=/.test(line)) {
      push(findings, filePath, lineNum, "input-image-missing-alt", "critical", '<input type="image"> is missing alt text.');
    }

    if (/\bonClick\b/.test(line) && !/<(button|a|input)\b/i.test(line)) {
      if (!/\bonKey(Down|Up|Press)\b/.test(line)) {
        push(findings, filePath, lineNum, "click-without-keyboard-handler", "serious", "Element has onClick but no keyboard handler.");
      }
    }

    if (/\brole\s*=\s*["']button["']/.test(line) && !/<button\b/i.test(line)) {
      if (!/\btabIndex\s*=\s*\{?\s*0/.test(line)) {
        push(findings, filePath, lineNum, "role-button-missing-tabindex", "serious", 'role="button" without tabIndex={0}.');
      }
    }

    if (/<(a|Link)\b/.test(line) && /\btarget\s*=\s*["']_blank["']/.test(line)) {
      if (!/\brel\s*=/.test(line) || !/\bnoopener\b/.test(line)) {
        push(findings, filePath, lineNum, "target-blank-without-rel", "moderate", 'target="_blank" without rel="noopener noreferrer".');
      }
    }

    if (/<h[1-6]\b/i.test(line)) {
      const hasText = />[^<\s][^<]*<\//.test(line) || /\baria-label\s*=/.test(line);
      if (!hasText) {
        push(findings, filePath, lineNum, "heading-empty", "serious", "Heading may be empty.");
      }
    }

    if (/<label\b/i.test(line) && !/\bhtmlFor\s*=/.test(line)) {
      push(findings, filePath, lineNum, "label-without-htmlfor", "moderate", "<label> missing htmlFor.");
    }

    if (/<(a|Link)\b/.test(line) && /\bhref\s*=\s*["']#["']/.test(line) && !/\bonClick\b/.test(line)) {
      push(findings, filePath, lineNum, "link-empty-hash", "moderate", 'Link uses href="#".');
    }

    if (/\brole\s*=\s*["']link["']/.test(line) && !/<(a|Link)\b/.test(line)) {
      if (!/\bhref\s*=/.test(line) && !/\btabIndex\s*=\s*\{?\s*0/.test(line)) {
        push(findings, filePath, lineNum, "role-link-missing-tabindex", "serious", "role=link not focusable.");
      }
      if (!/\bhref\s*=/.test(line) && !/\bonClick\b/.test(line)) {
        push(findings, filePath, lineNum, "role-link-missing-href", "moderate", "role=link without href.");
      }
    }

    if (/<dialog\b/i.test(line) || /\brole\s*=\s*["']dialog["']/.test(line)) {
      if (!/\baria-label\s*=/.test(line) && !/\baria-labelledby\s*=/.test(line)) {
        push(findings, filePath, lineNum, "dialog-missing-name", "serious", "Dialog missing name.");
      }
      if (!/\baria-modal\s*=/.test(line)) {
        push(findings, filePath, lineNum, "dialog-missing-aria-modal", "serious", "Dialog should use aria-modal={true}.");
      }
    }

    if (/\baria-expanded\s*=/.test(line) && !/\baria-controls\s*=/.test(line)) {
      push(
        findings,
        filePath,
        lineNum,
        "aria-expanded-without-controls",
        "moderate",
        "aria-expanded is set without aria-controls.",
      );
    }

    if (/\baria-label\s*=\s*["']["']/.test(line)) {
      push(findings, filePath, lineNum, "aria-label-empty", "serious", "Empty aria-label.");
    }
    if (/\baria-labelledby\s*=\s*["']["']/.test(line)) {
      push(findings, filePath, lineNum, "aria-labelledby-empty", "serious", "Empty aria-labelledby.");
    }
    if (/\baria-describedby\s*=\s*["']["']/.test(line)) {
      push(findings, filePath, lineNum, "aria-describedby-empty", "serious", "Empty aria-describedby.");
    }

    if (/<nav\b/i.test(line) && !/\baria-label\s*=/.test(line) && !/\baria-labelledby\s*=/.test(line)) {
      push(findings, filePath, lineNum, "nav-missing-label", "moderate", "<nav> missing label.");
    }

    if (/<aside\b/i.test(line) && !/\baria-label\s*=/.test(line)) {
      push(findings, filePath, lineNum, "aside-missing-label", "moderate", "<aside> missing label.");
    }

    if (/\brole\s*=\s*["']region["']/.test(line) && !/\baria-label\s*=/.test(line)) {
      push(findings, filePath, lineNum, "region-missing-label", "moderate", "region missing label.");
    }

    if (/<object\b/i.test(line) && !/\btitle\s*=/.test(line) && !/\baria-label\s*=/.test(line)) {
      push(findings, filePath, lineNum, "object-missing-alternative", "serious", "<object> missing name.");
    }

    if (/<embed\b/i.test(line) && !/\btitle\s*=/.test(line) && !/\baria-label\s*=/.test(line)) {
      push(findings, filePath, lineNum, "embed-missing-title", "serious", "<embed> missing title.");
    }

    if (/<audio\b/i.test(line)) {
      if (!/\bcontrols\b/.test(line) && !/\baria-hidden\s*=/.test(line)) {
        push(findings, filePath, lineNum, "audio-missing-controls", "moderate", "<audio> missing controls.");
      }
      if (/\bautoPlay\b/.test(line) && !/\bcontrols\b/.test(line)) {
        push(findings, filePath, lineNum, "audio-autoplay-without-controls", "serious", "<audio autoPlay> should include controls.");
      }
    }

    if (/<video\b/i.test(line)) {
      if (!/\bcontrols\b/.test(line) && !/\baria-hidden\s*=/.test(line)) {
        push(findings, filePath, lineNum, "video-missing-controls", "moderate", "<video> missing controls.");
      }
      if (/\bautoPlay\b/.test(line) && !/\bmuted\b/.test(line)) {
        push(findings, filePath, lineNum, "video-autoplay-without-muted", "serious", "Autoplay video not muted.");
      }
      if (!fileHasCaptionTrack && !reportedVideoCaptions && !/\baria-hidden\s*=/.test(line)) {
        reportedVideoCaptions = true;
        push(
          findings,
          filePath,
          lineNum,
          "video-missing-captions-track",
          "moderate",
          "<video> has no <track kind=\"captions\"> in this file (captions may live elsewhere).",
        );
      }
    }

    if (/\baccessKey\s*=/.test(line)) {
      push(findings, filePath, lineNum, "accesskey-usage", "minor", "accessKey attribute used.");
    }

    if (/\brole\s*=\s*["']img["']/.test(line) && !/<img\b/i.test(line) && !/\baria-label\s*=/.test(line)) {
      push(findings, filePath, lineNum, "role-img-missing-label", "serious", "role=img missing label.");
    }

    if (/<th\b/i.test(line) && !/\bscope\s*=/.test(line)) {
      push(findings, filePath, lineNum, "th-missing-scope", "moderate", "<th> missing scope.");
    }

    if (
      /<table\b/i.test(line) &&
      !/\brole\s*=\s*["']presentation["']/.test(line) &&
      !fileHasTableCaption &&
      !reportedTableCaption
    ) {
      reportedTableCaption = true;
      push(findings, filePath, lineNum, "table-missing-caption", "moderate", "<table> should include <caption>.");
    }

    if (/<fieldset\b/i.test(line)) {
      push(findings, filePath, lineNum, "fieldset-needs-legend", "moderate", "<fieldset> needs legend.");
    }

    if (/<(a|Link)\b/.test(line) && /\baria-disabled\s*=/.test(line) && /\bhref\s*=/.test(line)) {
      push(findings, filePath, lineNum, "aria-disabled-link", "moderate", "aria-disabled link with href.");
    }

    if (/<(div|span|p|section|article|li)\b/i.test(line) && /\btabIndex\s*=\s*\{?\s*0\s*\}?/.test(line)) {
      if (!/\brole\s*=/.test(line) && !/\bonClick\b/.test(line)) {
        push(findings, filePath, lineNum, "tabindex-zero-without-role", "serious", "tabIndex=0 on static element.");
      }
    }

    if (/\bclassName\s*=/.test(line) && /\boutline-none\b/.test(line) && !/focus-visible:|focus:|ring-/.test(line)) {
      push(findings, filePath, lineNum, "outline-none-utility", "serious", "outline-none without focus style.");
    }

    if (/<input\b/i.test(line) && /\btype\s*=\s*["'](submit|button|reset)["']/.test(line)) {
      if (!/\bvalue\s*=/.test(line) && !/\baria-label\s*=/.test(line)) {
        push(findings, filePath, lineNum, "input-submit-missing-value", "moderate", "Submit input missing value.");
      }
    }

    if (/<html\b/i.test(line)) {
      if (!/\blang\s*=/.test(line)) {
        push(findings, filePath, lineNum, "html-missing-lang", "serious", "<html> missing lang.");
      } else if (/\blang\s*=\s*["']\s*["']/.test(line)) {
        push(findings, filePath, lineNum, "html-lang-empty", "serious", "<html lang> is empty.");
      }
    }

    if (/<marquee\b/i.test(line) || /<blink\b/i.test(line)) {
      push(findings, filePath, lineNum, "blink-marquee-element", "serious", "Avoid blink/marquee (moving content without control).");
    }

    if (/http-equiv\s*=\s*["']refresh["']/i.test(line)) {
      push(findings, filePath, lineNum, "meta-http-equiv-refresh", "serious", "Meta refresh can disorient users.");
    }

    if (/<meta\b/i.test(line) && /\bname\s*=\s*["']viewport["']/i.test(line)) {
      if (/user-scalable\s*=\s*no/i.test(line) || /maximum-scale\s*=\s*["']?1(\.0)?["']?/.test(line)) {
        push(
          findings,
          filePath,
          lineNum,
          "meta-viewport-zoom-lock",
          "serious",
          "Viewport meta prevents zoom (pinch zoom should stay available).",
        );
      }
    }
  }

  const h1Lines: number[] = [];
  const mainLines: number[] = [];
  let lastHeadingLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNum = i + 1;
    if (/<h1\b/i.test(line)) h1Lines.push(lineNum);
    if (/<main\b/i.test(line) || /\brole\s*=\s*["']main["']/.test(line)) mainLines.push(lineNum);

    const hm = line.match(/<h([1-6])\b/i);
    if (hm) {
      const level = Number.parseInt(hm[1]!, 10);
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        push(
          findings,
          filePath,
          lineNum,
          "heading-level-skip",
          "moderate",
          `Heading level jumps from h${lastHeadingLevel} to h${level}.`,
        );
      }
      lastHeadingLevel = level;
    }
  }
  if (h1Lines.length > 1) {
    push(findings, filePath, h1Lines[1]!, "multiple-h1", "moderate", "Multiple h1 elements.");
  }
  if (mainLines.length > 1) {
    push(findings, filePath, mainLines[1]!, "multiple-main-landmarks", "moderate", "Multiple main landmarks.");
  }

  return findings;
}

export function healthScore(critical: number, serious: number, moderate: number, minor: number): number {
  const penalty = critical * 15 + serious * 8 + moderate * 3 + minor * 1;
  return Math.max(0, Math.min(100, 100 - penalty));
}
