# Claude Code: scoped Figma export

Invocation: `/figma-to-claude-to-code https://www.figma.com/design/FILE_KEY/NAME?node-id=123-456`

1. Check actual authorized Figma MCP capabilities and access. Parse file key and selected node from the URL. If no unambiguous root exists, inspect lightweight hierarchy and propose selectable roots. A selected node can be a layer, component, frame, section or page.
2. Inspect hierarchy before requesting heavy design context. Propose the selected node plus required dependencies as default coverage. Use parent/sibling metadata to understand boundaries; do not expand to the full file automatically.
3. Present a concrete scope proposal: file and selected node; roots; frames, states, modes and viewports; needed components, tokens and original assets; exclusions; unavailable context; bounded batches for large roots; and the exact private destination. Label observed facts separately from suggested additions. Obtain approval for roots, dependencies and destination before export. Existing explicit approval for this concrete proposal in the session suffices.
4. Fetch detailed evidence for approved roots only. Use available hierarchy/metadata, design context, screenshots, variable/style definitions, component or Code Connect mappings and original asset export. If responses truncate, query smaller child nodes. Record unsupported capabilities as unavailable. Code Connect is optional; never call an unverified mapping verified.
5. Export the versioned directory defined in [contract specification](contract-spec.md). Every material confirmed fact has a source node or evidence reference. `inferred` facts are non-binding and include their basis; `missing` values remain unknown. Do not infer APIs, authentication, business rules, responsive breakpoints, validation or payment behavior from visual labels.
6. If the Figma file changes during extraction, re-fetch affected nodes where possible and report inconsistent evidence. Record an exposed source version when available. Otherwise set `source.version` to `null`, explain why, and retain extraction timestamps and local hashes; do not claim an atomic snapshot.
7. Run `node scripts/validate.mjs /absolute/path/to/private-contract`. Report `ready`, `blocked` or `invalid`, approval coverage, unresolved issues and exact output path. Do not describe a partial blocked export as complete.

For feedback, verify contract ID, revision and manifest hash first. Recheck live Figma inside the previously approved scope. Preserve stable issue IDs and create a new contract revision, then ask the user to transfer it manually to Codex. Scope expansion requires a new concrete approval. Never silently rewrite the earlier contract or baseline.

The user must have permission to transfer the selected design data to the destination and other agent environment. Do not default to public links or this public skills repository. Raw MCP extracts are optional, scoped and sanitized.
