import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.join(root, "packages/isoso-cli/dist/cli.js");

if (!existsSync(cliEntry)) {
  execSync("npm run build", { cwd: root, stdio: "inherit" });
}
