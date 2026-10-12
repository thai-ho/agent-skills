# CLI validation and visual comparison

Requires Node.js >=22 and pnpm 11. `install.mjs` copies the complete skill and runs `pnpm install --prod --frozen-lockfile` in the copy. It does not authenticate agents or modify MCP credentials. Use project scope only with an existing project path. Supported destinations follow current Claude and Codex skill locations: `~/.claude/skills`, `~/.agents/skills`, or the corresponding `.claude/skills` and `.agents/skills` in a project.

```sh
node scripts/install.mjs --agent both --scope user --dry-run
node scripts/install.mjs --agent both --scope user
node scripts/install.mjs --agent codex --scope project --project /absolute/path/to/frontend
node scripts/doctor.mjs --project /absolute/path/to/frontend
node scripts/validate.mjs /absolute/path/to/private-contract
node scripts/validate.mjs /absolute/path/to/private-contract --feedback /private/output/feedback.json
node scripts/visual-diff.mjs --reference /private/contract/references/screen.png --actual /private/output/screen.png --out /private/output/diff-screen --channel-tolerance 0 --max-different-pixels 0
```

Commands resolve relative to the installed skill. `install.mjs`: exit 0 success, 1 usage/runtime failure, 2 conflict. `doctor.mjs`: exit 0 without local failures, 1 local failure. Doctor distinguishes `pass`, `fail`, `warning`, `unverified` and `not applicable`; Figma MCP and agent authentication remain unverified from a shell. `validate.mjs`: exit 0 ready, 2 structurally valid with design blockers, 3 invalid, 1 usage/runtime failure. It checks schema, hashes, safe paths, linked approval coverage, references, PNG dimensions, token aliases and mapping provenance. It never changes the source contract. `visual-diff.mjs`: exit 0 within threshold, 2 threshold exceeded, 1 invalid input/runtime. It writes `diff.png` and `report.json`; defaults are exact channel tolerance 0 and zero allowed different pixels. No crop, resize, alignment or mask is applied. Dimension mismatch fails.

Visual diff accepts existing PNGs. Capture is project-specific; use a stable browser, OS, viewport, device scale, fonts, data, state and mode, disable animations and wait for assets/fonts. Record capture settings in the implementation report. Browser rendering can vary across environments; choose explicit, justified thresholds for an accepted comparison. Compare to source Figma PNGs before establishing optional Playwright regression snapshots. Audit token/component/asset usage separately.

Troubleshooting: use `doctor.mjs` for missing local runtime dependencies; rerun installer with `--overwrite` only for a managed skill copy; re-export a package when a payload hash fails; ask Claude for a new revision when a material design fact or baseline is absent. Keep validation outputs in a private directory. Removing an accessible copy cannot remove copies already shared, Git history or service logs.
