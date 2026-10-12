# Agent Skills collection

Reusable, portable Agent Skills. The first package is [figma-to-claude-to-code](skills/figma-to-claude-to-code/SKILL.md), which moves a scoped, approved Figma design contract from Claude Code to a separate Codex implementation session. It does not connect the accounts or move data automatically.

## Quick start

Requires Node.js 22 or later and pnpm 11. In this checkout:

```sh
pnpm install --frozen-lockfile
pnpm --dir skills/figma-to-claude-to-code install --frozen-lockfile
node skills/figma-to-claude-to-code/scripts/install.mjs --agent both --scope user
node skills/figma-to-claude-to-code/scripts/doctor.mjs
pnpm test
```

For a project installation, use `--scope project --project /absolute/path/to/project`. Inspect first with `--dry-run`. Existing managed installs are left intact when current; changed installs require `--overwrite`. Unrelated directories are never overwritten.

See [the contract specification](skills/figma-to-claude-to-code/references/contract-spec.md) and [validation guide](skills/figma-to-claude-to-code/references/validation.md). Use only synthetic fixtures in this public collection. Keep real contracts, screenshots, assets, MCP output and target company source in an authorized private destination outside this repository. The `.gitignore` patterns here are a backstop, not permission to upload design data elsewhere.

No license has been selected for public redistribution. The owner should choose one before release.
