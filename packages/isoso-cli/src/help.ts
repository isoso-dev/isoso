import type { Command } from "commander";
import chalk from "chalk";

/** Full command list (used by `isoso help` and unknown-flag handling). */
export function printIsosoHelp(program: Command): void {
  console.log(chalk.bold("Isoso") + " — accessibility testing for React and TypeScript\n");
  program.outputHelp({ error: false });
}
