import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { getRules, runRulesOnElement, type Finding, type ScanResult } from "@isoso/core";
import { extractJsxElements } from "./jsx-extract.js";

export interface ScanProjectOptions {
  root: string;
  patterns?: string[];
  ignore?: string[];
  ruleIds?: string[];
}

const DEFAULT_PATTERNS = ["**/*.{tsx,jsx}"];
const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
];

export async function scanProject(options: ScanProjectOptions): Promise<ScanResult> {
  const start = Date.now();
  const root = path.resolve(options.root);
  const patterns = options.patterns ?? DEFAULT_PATTERNS;
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  const rules = getRules(options.ruleIds);

  const files = await fg(patterns, {
    cwd: root,
    absolute: true,
    ignore,
    onlyFiles: true,
  });

  const findings: Finding[] = [];

  for (const file of files) {
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const elements = extractJsxElements(file, source);
    for (const el of elements) {
      findings.push(...runRulesOnElement(el, rules));
    }
  }

  return {
    root,
    scannedAt: new Date().toISOString(),
    filesScanned: files.length,
    findings,
    durationMs: Date.now() - start,
  };
}
