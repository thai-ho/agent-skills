# Figma to Claude to Code

A manual handoff from Figma context in Claude Code to implementation in a separate Codex session.

Claude exports a scoped, approved design contract. You transfer it to an authorized private destination. Codex validates the contract, maps the design to the existing codebase, and presents a plan before implementation. This skill does not connect accounts or transfer data automatically.

## Get started

Requires Node.js 22 or later and pnpm 11. From the root of this repository:

```sh
pnpm install --frozen-lockfile
pnpm --dir skills/figma-to-claude-to-code install --frozen-lockfile
node skills/figma-to-claude-to-code/scripts/install.mjs --agent both --scope user --dry-run
node skills/figma-to-claude-to-code/scripts/install.mjs --agent both --scope user
node skills/figma-to-claude-to-code/scripts/doctor.mjs
pnpm test
```

For a project installation, use `--scope project --project /absolute/path/to/project`. Inspect the destinations first with `--dry-run`.

Existing managed installs are left intact when current. Changed packages, including documentation changes, require `--overwrite` to update an existing managed installation. Review any local edits before using that flag. Unrelated directories are never overwritten.

## Use the handoff

In Claude Code, start with the Figma URL:

```text
/figma-to-claude-to-code https://www.figma.com/design/FILE_KEY/NAME?node-id=123-456
```

Review and approve the concrete export scope and private destination. After export, manually transfer the contract to the authorized Codex environment.

In Codex, from the target frontend repository, supply that contract explicitly:

```text
$figma-to-claude-to-code /absolute/path/to/private-contract/
```

Codex validates it, inspects the codebase, and presents the implementation plan for approval. A Figma URL alone is not enough for this skill's Codex mode.

## The details

- [Skill instructions](SKILL.md)
- [Claude export workflow](references/claude-workflow.md)
- [Codex implementation workflow](references/codex-workflow.md)
- [Contract specification](references/contract-spec.md)
- [Validation and visual comparison](references/validation.md)

The package is version 0.1.0. Live evaluation on an authorized component, single screen, and multi-screen feature is required before calling it v1.0 ready.

## Keep real design data private

Use this handoff only when you have permission to transfer the selected design data to the destination and other agent environment. Keep real contracts, screenshots, assets, MCP output, validation artifacts, and company source in an authorized private destination outside this public repository. Only synthetic fixtures belong here; `.gitignore` is a backstop.

No license has been selected for public redistribution.
