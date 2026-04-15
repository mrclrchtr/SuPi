## Why

The current `@lsp` extension injects generic pre-turn runtime guidance whenever active LSP coverage exists, even during OpenSpec and Markdown-heavy work where that context is not useful. This creates token noise, distracts the agent into acknowledging the guidance in its replies, and weakens the value of runtime LSP context by surfacing it when nothing actionable changed.

## What Changes

- Replace coverage-only pre-turn LSP guidance with stateful runtime gating driven by actual source-file tool activity.
- Keep static `promptSnippet` and `promptGuidelines` so `lsp` remains discoverable without per-turn repetition.
- Activate runtime LSP context only after qualifying tool interactions on supported source files, such as `read`, `edit`, `write`, or `lsp`.
- Re-inject runtime guidance only when meaningful LSP state changes, such as first activation or changed diagnostics, instead of on every prompt.
- Remove generic runtime coverage announcements like `Active LSP coverage: ...` from `before_agent_start` guidance.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `lsp-agent-context`: Narrow turn-start LSP context so it is event-driven, stateful, and silent unless a qualifying source interaction or actionable LSP state change occurs.

## Impact

- Affected code: `lsp/lsp.ts`, `lsp/guidance.ts`, and possibly small helpers in `lsp/manager.ts`.
- Affected tests: `lsp/__tests__/guidance.test.ts` and related runtime guidance coverage.
- Affected behavior: runtime LSP guidance becomes much rarer and more action-oriented, while static tool guidance remains available in the default prompt.
