import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function readEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    out[parsed.key] = parsed.value;
  }
  return out;
}

/** Load `.env` from cwd and parent dirs (closest file wins; shell env is not overwritten). */
export function loadProjectEnv(startDir = process.cwd()): void {
  const preset = new Set(Object.keys(process.env));
  const chain: string[] = [];
  let dir = resolve(startDir);
  for (let depth = 0; depth < 12; depth++) {
    chain.push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const merged: Record<string, string> = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    const envPath = resolve(chain[i]!, ".env");
    if (existsSync(envPath)) {
      Object.assign(merged, readEnvFile(envPath));
    }
  }

  for (const [key, value] of Object.entries(merged)) {
    if (!preset.has(key)) {
      process.env[key] = value;
    }
  }
}
