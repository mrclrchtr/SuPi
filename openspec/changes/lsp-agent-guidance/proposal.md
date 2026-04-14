## Why

The current LSP extension gives the agent semantic tools, but it does not strongly steer the model to use them. As a result, the agent can fall back to token-heavy `bash` searches instead of cheaper, more precise LSP operations, and it does not consistently see active LSP coverage or outstanding diagnostics before starting a turn.

## What Changes

- Add `promptSnippet` and `promptGuidelines` to the `lsp` tool so the default pi system prompt clearly advertises when semantic navigation should be preferred.
- Inject LSP coverage guidance in `before_agent_start` so each prompt can tell the agent which files and languages have semantic support available.
- Push outstanding LSP diagnostics into pre-turn context so the agent sees unresolved problems before it decides what to do next.
- Keep the behavior advisory and lightweight in v1: guide the model toward `lsp` first without introducing hard blocking or core pi changes.

## Capabilities

### New Capabilities
- `lsp-tool-guidance`: Teach the agent when and why to prefer the `lsp` tool for supported code navigation and diagnostics workflows.
- `lsp-agent-context`: Provide per-turn semantic context about active LSP coverage and unresolved diagnostics before the model begins work.

### Modified Capabilities
<!-- No existing main specs to modify in openspec/specs yet -->

## Impact

- **Affected code**: `lsp/lsp.ts`, and possibly small helpers in `lsp/manager.ts` or `lsp/tool-actions.ts` for coverage/diagnostic summaries.
- **Agent behavior**: stronger preference for semantic navigation over raw shell search in supported languages.
- **Prompting**: LSP guidance becomes visible in pi's default tool prompt and in turn-start context.
- **No new dependencies**: implementation should reuse the existing extension/event infrastructure.
