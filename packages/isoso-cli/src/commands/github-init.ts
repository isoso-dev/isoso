import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const WORKFLOW_NAME = "isoso-a11y.yml";

export async function runGithubInit(root: string, options: { force?: boolean }): Promise<void> {
  const workflowDir = path.join(root, ".github", "workflows");
  const dest = path.join(workflowDir, WORKFLOW_NAME);

  if (!options.force) {
    try {
      await access(dest);
      throw new Error(
        `${dest} already exists. Use --force to overwrite.`
      );
    } catch (e) {
      if (e instanceof Error && e.message.includes("already exists")) throw e;
    }
  }

  await mkdir(workflowDir, { recursive: true });

  const require = createRequire(import.meta.url);
  const packageRoot = path.dirname(require.resolve("isoso/package.json"));
  const templateDir = path.join(packageRoot, "templates");
  const template = await readFile(path.join(templateDir, WORKFLOW_NAME), "utf8");
  await writeFile(dest, template, "utf8");
}
