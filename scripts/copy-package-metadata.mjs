import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = path.join(root, "packages/isoso-cli");

for (const name of ["README.md", "LICENSE"]) {
  const from = path.join(root, name);
  const to = path.join(pkgDir, name);
  if (!existsSync(from)) {
    console.warn(`copy-package-metadata: skip missing ${name}`);
    continue;
  }
  copyFileSync(from, to);
  console.log(`copy-package-metadata: ${name} → packages/isoso-cli/`);
}
