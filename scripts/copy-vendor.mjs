import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPkg = path.join(root, "packages/isoso-cli");
const vendorRoot = path.join(cliPkg, "vendor");

rmSync(vendorRoot, { recursive: true, force: true });

const packages = [
  {
    name: "@isoso/core",
    dir: "core",
    from: path.join(root, "packages/isoso-core"),
  },
  {
    name: "@isoso/scanner",
    dir: "scanner",
    from: path.join(root, "packages/isoso-scanner"),
  },
];

for (const pkg of packages) {
  const dest = path.join(vendorRoot, pkg.dir);
  mkdirSync(dest, { recursive: true });
  cpSync(path.join(pkg.from, "dist"), path.join(dest, "dist"), { recursive: true });
  const manifest = {
    name: pkg.name,
    version: "0.1.0",
    type: "module",
    main: "./dist/index.js",
    exports: {
      ".": {
        import: "./dist/index.js",
        types: "./dist/index.d.ts",
      },
    },
  };
  if (pkg.name === "@isoso/scanner") {
    const sourcePkg = JSON.parse(
      readFileSync(path.join(pkg.from, "package.json"), "utf8")
    );
    manifest.dependencies = {
      ...sourcePkg.dependencies,
      "@isoso/core": "0.1.0",
    };
  }
  writeFileSync(path.join(dest, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
