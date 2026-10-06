import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getFixableRuleIds, type Finding } from "@isoso/core";
import { applyFixesToSource, type AppliedFix } from "./apply-fixes.js";
import { scanProject, type ScanProjectOptions } from "./scan-project.js";

export interface FixProjectOptions extends Omit<ScanProjectOptions, "engine" | "onProgress"> {
  write?: boolean;
  onProgress?: (message: string) => void;
}

export interface FileFixOutcome {
  file: string;
  applied: AppliedFix[];
  written: boolean;
}

export interface FixProjectResult {
  root: string;
  filesScanned: number;
  findingsBefore: number;
  fixableFindings: number;
  outcomes: FileFixOutcome[];
  durationMs: number;
}

export async function fixProject(options: FixProjectOptions): Promise<FixProjectResult> {
  const start = Date.now();
  const root = path.resolve(options.root);
  const allowed =
    options.ruleIds?.length && options.ruleIds.length > 0
      ? new Set(options.ruleIds.filter((id) => getFixableRuleIds().includes(id)))
      : undefined;

  const scanResult = await scanProject({
    ...options,
    root,
    engine: "static",
    onProgress: options.onProgress,
  });

  const fixableFindings = scanResult.findings.filter(
    (f) =>
      getFixableRuleIds().includes(f.ruleId) &&
      (!allowed || allowed.has(f.ruleId)),
  );

  const byFile = new Map<string, Finding[]>();
  for (const f of fixableFindings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }

  const outcomes: FileFixOutcome[] = [];

  for (const [file, findings] of byFile) {
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch {
      continue;
    }

    const { source: next, changed, applied } = applyFixesToSource(
      source,
      findings,
      allowed,
    );

    let written = false;
    if (changed && options.write) {
      await writeFile(file, next, "utf8");
      written = true;
    }

    if (applied.length > 0) {
      outcomes.push({ file, applied, written });
    }
  }

  return {
    root,
    filesScanned: scanResult.filesScanned,
    findingsBefore: scanResult.findings.length,
    fixableFindings: fixableFindings.length,
    outcomes,
    durationMs: Date.now() - start,
  };
}
