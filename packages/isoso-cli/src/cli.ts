#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import {
  explainFinding,
  formatJsonReport,
  formatTextReport,
  exitCodeForResult,
  getRuleById,
  hasAiScanKey,
  type Severity,
} from "@isoso/core";
import { fixProject, scanProject } from "@isoso/scanner";
import { isFixableRuleId } from "@isoso/core";
import { loadProjectEnv } from "./load-env.js";
import { attachDetailedHelp, printIsosoHelp } from "./help.js";
import { readCliVersion, warnIfOutdatedCli } from "./version-check.js";

loadProjectEnv();

const program = new Command();

program.exitOverride();

program.configureOutput({
  writeErr: (str) => {
    const trimmed = str.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("error:") && trimmed.includes("unknown option")) return;
    if (trimmed.startsWith("error:") && trimmed.includes("unknown command")) return;
    process.stderr.write(str);
  },
});

program
  .name("isoso")
  .description("Accessibility testing for React and TypeScript codebases")
  .version(readCliVersion());

program
  .command("scan")
  .description("Scan a project for accessibility issues in JSX/TSX")
  .argument("[path]", "Project root", ".")
  .option("-f, --format <type>", "Output format: text or json", "text")
  .option("--fail-on <severity>", "Exit 1 if findings at or above severity", "serious")
  .option("--rules <ids>", "Comma-separated rule ids to run")
  .option("-o, --output <file>", "Write report to file (useful in CI)")
  .option("--static", "Use built-in static rules only (no AI scan)")
  .option("--ai", "Require AI scan (needs ISOSO_AI_KEY in .env)")
  .action(
    async (
      scanPath: string,
      opts: {
        format: string;
        failOn: string;
        rules?: string;
        output?: string;
        static?: boolean;
        ai?: boolean;
      }
    ) => {
    const outdated = await warnIfOutdatedCli();
    const root = path.resolve(scanPath);
    const ruleIds = opts.rules?.split(",").map((s) => s.trim()).filter(Boolean);
    const hasKey = hasAiScanKey();

    if (opts.ai && !hasKey) {
      console.error(
        chalk.red(
          "AI scan requires ISOSO_AI_KEY. Add it to .env (see .env.example) or omit --ai.",
        ),
      );
      process.exit(1);
    }

    if (opts.static && opts.ai) {
      console.error(chalk.red("Use either --static or --ai, not both."));
      process.exit(1);
    }

    const engine = opts.static ? "static" : opts.ai ? "ai" : undefined;

    if (!opts.static && hasKey) {
      console.error(chalk.dim("Scanning with AI (same finding format as Isoso rules)…"));
    } else if (!hasKey && !opts.static) {
      console.error(
        chalk.yellow(
          "No AI key found; using static rules. Set ISOSO_AI_KEY in .env for AI scan.",
        ),
      );
    }

    const result = await scanProject({
      root,
      ruleIds,
      engine,
      onProgress: (msg) => console.error(chalk.dim(msg)),
    });

    let report =
      opts.format === "json" ? formatJsonReport(result) : formatTextReport(result);
    if (outdated && opts.format === "text") {
      report = `${outdated.plainBanner}\n\n${report}`;
    }

    if (opts.output) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(opts.output, report, "utf8");
      if (opts.format !== "json") {
        console.log(chalk.dim(`Report written to ${opts.output}`));
      }
    } else {
      console.log(report);
    }

    const failOn = opts.failOn as Severity;
    process.exit(exitCodeForResult(result, failOn));
  }
  );

program
  .command("fix")
  .description("Apply automatic fixes for static scan findings")
  .argument("[path]", "Project root", ".")
  .option("--rules <ids>", "Comma-separated fixable rule ids")
  .option("--dry-run", "Preview fixes without writing to disk")
  .action(
    async (
      fixPath: string,
      opts: { rules?: string; dryRun?: boolean },
    ) => {
      const outdated = await warnIfOutdatedCli();
      const root = path.resolve(fixPath);
      const ruleIds = opts.rules?.split(",").map((s) => s.trim()).filter(Boolean);
      const write = !opts.dryRun;

      console.error(
        chalk.dim(
          write
            ? "Applying fixes to disk…"
            : "Dry run — no files will be changed (omit --dry-run to apply).",
        ),
      );

      const result = await fixProject({
        root,
        ruleIds,
        write,
        onProgress: (msg) => console.error(chalk.dim(msg)),
      });

      const lines: string[] = [
        ...(outdated ? [outdated.plainBanner, ""] : []),
        "Isoso fix",
        `Root: ${result.root}`,
        `Mode: ${write ? "write" : "dry-run"}`,
        `Files scanned: ${result.filesScanned}`,
        `Fixable findings: ${result.fixableFindings}`,
        "",
      ];

      if (result.outcomes.length === 0) {
        lines.push("No automatic fixes applied.");
      } else {
        for (const o of result.outcomes) {
          const rel = path.relative(result.root, o.file) || o.file;
          lines.push(`${rel}${o.written ? chalk.green(" (written)") : ""}`);
          for (const a of o.applied) {
            lines.push(`  ${chalk.yellow(a.ruleId)}:${a.line} — ${a.description}`);
          }
          lines.push("");
        }
        if (!write) {
          lines.push(chalk.dim("Re-run without --dry-run to write these edits."));
        }
      }

      lines.push(`Completed in ${result.durationMs}ms`);
      console.log(lines.join("\n"));
    },
  );

program
  .command("help")
  .description("Show all commands and options")
  .action(() => {
    printIsosoHelp(program);
  });

program
  .command("explain")
  .description("Explain a finding (AI when ISOSO_AI_KEY is set)")
  .requiredOption("--rule <id>", "Rule id")
  .option("--file <path>", "File path")
  .option("--line <n>", "Line number", "1")
  .option("--message <text>", "Finding message")
  .option("--snippet <text>", "Code snippet from the scan")
  .option("--builtin", "Use built-in guidance only (no API call)")
  .action(
    async (opts: {
      rule: string;
      file?: string;
      line: string;
      message?: string;
      snippet?: string;
      builtin?: boolean;
    }) => {
      const rule = getRuleById(opts.rule);
      const finding = {
        ruleId: opts.rule,
        message: opts.message ?? rule?.description ?? `Example finding for rule ${opts.rule}`,
        severity: rule?.severity ?? ("serious" as const),
        wcag: rule?.wcag ?? [],
        file: opts.file ?? "example.tsx",
        line: Number.parseInt(opts.line, 10) || 1,
        column: 1,
        snippet: opts.snippet,
        fixHint: rule?.description,
      };
      const hasKey = hasAiScanKey();
      if (!opts.builtin && !hasKey) {
        console.error(
          chalk.yellow(
            "No ISOSO_AI_KEY found. Add one to .env in your project (see .env.example). Using built-in guidance.",
          ),
        );
      }
      const explanation = await explainFinding(finding, { preferBuiltin: opts.builtin });
      const tag = explanation.source === "ai" ? chalk.cyan("(AI)") : chalk.dim("(built-in)");
      console.log(chalk.bold("Summary"), tag, "\n", explanation.summary, "\n");
      console.log(chalk.bold("Impact"), "\n", explanation.impact, "\n");
      console.log(chalk.bold("Remediation"), "\n", explanation.remediation);
    }
  );

program
  .command("rules")
  .description("List available static rules")
  .action(async () => {
    const { jsxRules } = await import("@isoso/core");
    for (const r of jsxRules) {
      const fixTag = isFixableRuleId(r.id) ? chalk.green(" [fixable]") : "";
      console.log(`${chalk.yellow(r.id)} — ${r.name} [${r.severity}]${fixTag}`);
      console.log(chalk.dim(`  WCAG: ${r.wcag.join(", ")}`));
    }
  });

attachDetailedHelp(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const coded =
    err && typeof err === "object" && "code" in err
      ? (err as { code?: string; message?: string })
      : undefined;

  if (coded?.code === "commander.unknownOption" || coded?.code === "commander.unknownCommand") {
    console.error(chalk.red(coded.message ?? "Unknown option or command"));
    printIsosoHelp(program);
    process.exit(1);
  }

  if (coded?.code === "commander.helpDisplayed" || coded?.code === "commander.help") {
    printIsosoHelp(program);
    process.exit(0);
  }

  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
