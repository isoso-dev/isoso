import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

const NPM_LATEST_URL = "https://registry.npmjs.org/@isoso.dev%2Fisoso/latest";
const CHECK_TIMEOUT_MS = 3_000;

let cachedLatest: string | undefined | null = null;

export function readCliVersion(): string {
  const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

export function isCiEnvironment(): boolean {
  return Boolean(
    process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.GITLAB_CI ||
      process.env.CIRCLECI ||
      process.env.JENKINS_URL ||
      process.env.BUILDKITE ||
      process.env.TF_BUILD,
  );
}

function shouldCheckVersion(): boolean {
  if (process.env.ISOSO_SKIP_VERSION_CHECK?.trim()) return false;
  return isCiEnvironment();
}

function parseCoreVersion(version: string): [number, number, number] {
  const core = version.replace(/^v/i, "").split("-")[0] ?? "";
  const [major = "0", minor = "0", patch = "0"] = core.split(".");
  return [Number(major) || 0, Number(minor) || 0, Number(patch) || 0];
}

export function isVersionOlder(current: string, latest: string): boolean {
  const a = parseCoreVersion(current);
  const b = parseCoreVersion(latest);
  for (let i = 0; i < 3; i++) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return false;
}

async function fetchLatestPublishedVersion(): Promise<string | undefined> {
  if (cachedLatest !== null) {
    return cachedLatest === undefined ? undefined : cachedLatest;
  }

  try {
    const res = await fetch(NPM_LATEST_URL, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      cachedLatest = undefined;
      return undefined;
    }
    const data = (await res.json()) as { version?: string };
    const latest = data.version?.trim();
    cachedLatest = latest || undefined;
    return cachedLatest;
  } catch {
    cachedLatest = undefined;
    return undefined;
  }
}

export function formatOutdatedPlainBanner(current: string, latest: string): string {
  return [
    "════════════════════════════════════════════════════════════════════",
    `Isoso CLI is outdated (running ${current}, latest on npm is ${latest}).`,
    "Update in this repo:",
    "  npm install -D @isoso.dev/isoso@latest",
    "Or run without installing:",
    "  npx @isoso.dev/isoso@latest scan",
    "════════════════════════════════════════════════════════════════════",
  ].join("\n");
}

function formatOutdatedStderrBanner(current: string, latest: string): string {
  const lines = formatOutdatedPlainBanner(current, latest).split("\n");
  return lines.map((line) => chalk.red.bold(line)).join("\n");
}

export interface OutdatedCliInfo {
  current: string;
  latest: string;
  plainBanner: string;
}

/** Returns outdated info when CI + npm latest is newer; prints red banner to stderr. */
export async function warnIfOutdatedCli(): Promise<OutdatedCliInfo | null> {
  if (!shouldCheckVersion()) return null;

  const current = readCliVersion();
  const latest = await fetchLatestPublishedVersion();
  if (!latest || !isVersionOlder(current, latest)) return null;

  const plainBanner = formatOutdatedPlainBanner(current, latest);
  console.error(formatOutdatedStderrBanner(current, latest));
  console.error("");
  return { current, latest, plainBanner };
}
