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
  type Severity,
} from "@isoso/core";
import { scanProject } from "@isoso/scanner";
import { loadProjectEnv } from "./load-env.js";

loadProjectEnv();

const program = new Command();

program
  .name("isoso")
  .description("Accessibility testing for React and TypeScript codebases")
  .version("0.1.0");

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
    const root = path.resolve(scanPath);
    const ruleIds = opts.rules?.split(",").map((s) => s.trim()).filter(Boolean);
    const hasKey = Boolean(
      process.env.ISOSO_AI_KEY?.trim() ?? process.env.OPENAI_API_KEY?.trim(),
    );

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

    const report =
      opts.format === "json" ? formatJsonReport(result) : formatTextReport(result);

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
      const hasKey = Boolean(
        process.env.ISOSO_AI_KEY?.trim() ?? process.env.OPENAI_API_KEY?.trim(),
      );
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
      console.log(`${chalk.yellow(r.id)} — ${r.name} [${r.severity}]`);
      console.log(chalk.dim(`  WCAG: ${r.wcag.join(", ")}`));
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
