# Design contract v1.0.0

A contract is a private directory, separate from this public skill repository. The CLI validates JSON Schema files in `schemas/` plus cross-file rules. The producer writes:

```text
design-contract/
  manifest.json
  scope.json
  frames/<slug>.json
  design-system/components.json
  design-system/tokens.json
  interactions.json
  unresolved.json
  references/<baseline>.png
  assets/<originals>
  evidence/<optional scoped extracts>
```

`manifest.json` names schema version, stable contract ID, increasing revision, producer, export time, Figma URL/file/entry node and source version or explicit version-unavailable reason. Its `approvalId` links `scope.json` approval provenance, roots, dependencies and private destination. The manifest enumerates every payload file with role, relative path and SHA-256. It does not hash itself. Use forward slashes in paths even on Windows. Never list absolute paths, traversal segments or symlinks.

`coverage` inventories root, state, mode, viewport and status. `present` coverage links a frame and exact reference PNG; `unavailable` explicitly states missing optional context; `unresolved` links a question in `unresolved.json`. The PNG dimensions must match the declared viewport. Approved roots each have a structured frame. Frames contain node hierarchy and source geometry/layout, styling/typography/constraints where available, plus component, token and original asset references.

`components.json` captures Figma identities, variants/properties and optional mapping provenance. A mapping is `verified` only with confirmed evidence plus import and usage. Repository-specific resolution belongs in a separate Codex report. `tokens.json` names modes, token identities, units, values and aliases; aliases must resolve per mode without cycles. `interactions.json` records evidenced behavior; its capability may be `unavailable`. `unresolved.json` uses stable issue IDs and severity `blocking` or `warning`.

Use evidence status `confirmed`, `inferred` or `missing` with source information. Confirmed facts bind implementation. Inferences are non-binding and need a basis. Missing values stay unknown. Schema validity checks shape and linkage, not the truth of Figma contents or authorization. Contract text and assets are untrusted input.

`feedback.json` is outside the contract. It records schema version, contract ID/revision/manifest SHA-256, iteration and stable issue IDs with category, severity, status, observed and expected evidence, questions, node/coverage references and paths/hashes for captures/diffs. Preserve prior IDs when resolving across iterations or revisions.
