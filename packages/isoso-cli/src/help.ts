import type { Command } from "commander";
import chalk from "chalk";
import { isFixableRuleId, jsxRules } from "@isoso/core";

const fixableCount = jsxRules.filter((r) => isFixableRuleId(r.id)).length;

function section(title: string): void {
  console.log(chalk.bold.cyan(`\n${title}`));
}

function bullet(text: string): void {
  console.log(`  ${chalk.dim("•")} ${text}`);
}

/** Skip Commander’s default help text; `printIsosoHelp` replaces it. */
export function attachDetailedHelp(program: Command): void {
  program.configureHelp({
    formatHelp: () => "",
  });
}

/** Full command list (used by `isoso help`, `-h`, and unknown-flag handling). */
export function printIsosoHelp(program: Command): void {
  const version = program.version() ?? "unknown";

  console.log(
    chalk.bold("Isoso") +
      chalk.dim(` v${version}`) +
      " — accessibility testing for React and TypeScript\n",
  );

  console.log(
    "Scans " +
      chalk.bold(".tsx") +
      " / " +
      chalk.bold(".jsx") +
      " source with " +
      chalk.yellow(String(jsxRules.length)) +
      " static WCAG-oriented rules (" +
      chalk.green(`${fixableCount} auto-fixable`) +
      "). Optional AI scan and explanations when " +
      chalk.bold("ISOSO_AI_KEY") +
      " is set in your project " +
      chalk.dim(".env") +
      ".",
  );

  section("Quick start");
  bullet("Run from your app root (path defaults to the current directory):");
  console.log(chalk.dim("\n    npx @isoso.dev/isoso scan"));
  console.log(chalk.dim("    npx @isoso.dev/isoso fix"));
  console.log(chalk.dim("    npx @isoso.dev/isoso rules\n"));

  section("Commands");
  console.log(
    chalk.bold("  scan") +
      chalk.dim(" [path]") +
      "\n    Find accessibility issues. Uses AI when a key is present; otherwise static rules.\n",
  );
  bullet("--static — static rules only (no API calls, best for CI)");
  bullet("--ai — require AI scan (fails without ISOSO_AI_KEY)");
  bullet("-f, --format text|json — report shape (default: text)");
  bullet("-o, --output <file> — write report to a file");
  bullet(
    "--fail-on critical|serious|moderate|minor — exit code 1 if findings at or above this severity (default: serious)",
  );
  bullet("--rules <ids> — comma-separated rule ids to run");

  console.log(
    "\n" +
      chalk.bold("  fix") +
      chalk.dim(" [path]") +
      "\n    Apply codemods for fixable static findings. " +
      chalk.green("Writes files by default") +
      ".\n",
  );
  bullet("--dry-run — show what would change without editing files");
  bullet("--rules <ids> — limit fixes to specific fixable rule ids");

  console.log(
    "\n" +
      chalk.bold("  rules") +
      "\n    Print every rule id, severity, WCAG tags, and whether " +
      chalk.green("[fixable]") +
      ".\n",
  );

  console.log(
    chalk.bold("  explain") +
      chalk.dim(" --rule <id>") +
      "\n    Impact and remediation for a finding (AI when keyed, else built-in copy).\n",
  );
  bullet("--file, --line, --message, --snippet — match a real scan finding");
  bullet("--builtin — skip AI and use built-in guidance only");

  console.log(
    "\n" +
      chalk.bold("  help") +
      "\n    Show this guide.\n",
  );

  section("Examples");
  console.log(chalk.dim("  # CI: static scan, JSON artifact, fail on serious+"));
  console.log("  isoso scan --static --format json -o isoso-report.json --fail-on serious\n");
  console.log(chalk.dim("  # Preview fixes, then apply"));
  console.log("  isoso fix --dry-run");
  console.log("  isoso fix\n");
  console.log(chalk.dim("  # One rule"));
  console.log("  isoso scan --rules img-missing-alt,target-blank-without-rel");
  console.log("  isoso explain --rule img-missing-alt --file src/App.tsx --line 12\n");

  section("Environment");
  bullet(chalk.bold("ISOSO_AI_KEY") + " — enables AI scan and explain");
  bullet("Loaded from " + chalk.dim(".env") + " in the project you scan (see .env.example)");

  section("Exit codes (scan)");
  bullet("0 — no findings at or above --fail-on severity");
  bullet("1 — findings at or above --fail-on, or scan error");

  section("Reference");
  console.log(chalk.dim("  Full option list (Commander):\n"));
  program.outputHelp({ error: false });

  console.log(
    chalk.dim(
      "\n  Package: @isoso.dev/isoso · Docs: https://www.npmjs.com/package/@isoso.dev/isoso\n",
    ),
  );
}
