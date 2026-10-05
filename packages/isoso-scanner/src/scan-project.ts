import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import {
  getRules,
  hasAiScanKey,
  runFileRules,
  runRulesOnElement,
  scanFileWithAi,
  type Finding,
  type ScanEngine,
  type ScanResult,
} from "@isoso/core";
import { extractJsxElements } from "./jsx-extract.js";

export interface ScanProjectOptions {
  root: string;
  patterns?: string[];
  ignore?: string[];
  ruleIds?: string[];
  /** Default: AI when ISOSO_AI_KEY is set, otherwise static. */
  engine?: ScanEngine;
  aiApiKey?: string;
  aiModel?: string;
  onProgress?: (message: string) => void;
}

const DEFAULT_PATTERNS = ["**/*.{tsx,jsx}"];
const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
];

function resolveEngine(options: ScanProjectOptions): ScanEngine {
  if (options.engine) return options.engine;
  if (options.aiApiKey?.trim()) return "ai";
  return hasAiScanKey() ? "ai" : "static";
}

async function scanStatic(
  files: string[],
  ruleIds: string[] | undefined
): Promise<Finding[]> {
  const rules = getRules(ruleIds);
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
    findings.push(...runFileRules(file, source));
  }

  return findings;
}

async function scanAi(
  files: string[],
  options: ScanProjectOptions
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const aiOpts = { apiKey: options.aiApiKey, model: options.aiModel };

  for (const file of files) {
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch {
      continue;
    }
    options.onProgress?.(`AI scan: ${path.relative(options.root, file) || file}`);
    const fileFindings = await scanFileWithAi(file, source, aiOpts);
    findings.push(...fileFindings);
  }

  return findings;
}

export async function scanProject(options: ScanProjectOptions): Promise<ScanResult> {
  const start = Date.now();
  const root = path.resolve(options.root);
  const patterns = options.patterns ?? DEFAULT_PATTERNS;
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  const engine = resolveEngine(options);

  const files = await fg(patterns, {
    cwd: root,
    absolute: true,
    ignore,
    onlyFiles: true,
  });

  let findings =
    engine === "ai"
      ? await scanAi(files, { ...options, root })
      : await scanStatic(files, options.ruleIds);

  if (options.ruleIds?.length) {
    const allow = new Set(options.ruleIds);
    findings = findings.filter((f) => allow.has(f.ruleId));
  }

  return {
    root,
    scannedAt: new Date().toISOString(),
    filesScanned: files.length,
    findings,
    durationMs: Date.now() - start,
    engine,
  };
}
