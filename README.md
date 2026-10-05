# Isoso

**Accessibility testing for developers.** Isoso scans React and TypeScript JSX for common WCAG-related patterns in your source code—locally or in CI.

Isoso Cloud (dashboard, org-wide analytics, policies) is separate; this repository is the open-source Phase 1 product.

## Install

```bash
npm install -D isoso
```

After install, run the **`isoso`** command via npm scripts or `npx`:

```bash
npx isoso scan
# or add to package.json: "a11y": "isoso scan"
```

## Quick start

```bash
# Scan current directory (OpenAI when OPENAI_API_KEY is in .env; else static rules)
npx isoso scan

# Force static rules only (no API)
npx isoso scan --static

# JSON report for CI
npx isoso scan --format json -o isoso-report.json --fail-on serious

# List rules
npx isoso rules

# Explain a rule (OpenAI when a key is in .env; add --builtin for static copy)
npx isoso explain --rule img-missing-alt

# Add GitHub Actions workflow
npx isoso github
```

## Monorepo packages

| Package | Purpose |
|---------|---------|
| `isoso` | CLI (`scan`, `explain`, `rules`, `github`) |
| `@isoso/core` | Rule engine, reports, explanations |
| `@isoso/scanner` | React/TSX static scanner |

## Development

```bash
npm install
npm run build
npx isoso scan examples/sample-app
```

## AI scan and explanations

With `OPENAI_API_KEY` or `ISOSO_AI_KEY` in `.env`, **`isoso scan` uses OpenAI** to review each `.tsx`/`.jsx` file and returns findings in the **same format** as the eight built-in rules (`ruleId`, severity, WCAG, line, message, fix hint). Counts and terminal/JSON reports match the static engine.

The CLI loads `.env` from your current directory and parent folders automatically.

`isoso explain` uses the same key for deeper text on a single finding.

1. Copy `Isoso CLI/.env.example` to `Isoso CLI/.env` (or put `.env` in the app repo where you run `isoso`).
2. Paste your key as `OPENAI_API_KEY=sk-...`
3. Run `npx isoso explain --rule img-missing-alt --file src/App.tsx --line 24`

Use `--builtin` to skip the API and use curated WCAG guidance only.

## License

MIT
