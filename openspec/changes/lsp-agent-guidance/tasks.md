## 1. Tool Prompt Guidance

- [x] 1.1 Add `promptSnippet` and `promptGuidelines` to the `lsp` tool registration in `lsp/lsp.ts`
- [x] 1.2 Write guidance text that tells the agent to prefer `lsp` for symbol lookup, definitions, references, symbols, rename planning, code actions, and diagnostics in supported languages
- [x] 1.3 Preserve explicit fallback guidance for unsupported file types and plain-text search workflows

## 2. Pre-turn LSP Context

- [x] 2.1 Add manager/helper methods to summarize active or known LSP coverage for the current project
- [x] 2.2 Add manager/helper methods to summarize outstanding diagnostics in a compact, bounded form
- [x] 2.3 Implement a `before_agent_start` hook in `lsp/lsp.ts` that injects semantic-first coverage guidance when LSP context is relevant
- [x] 2.4 Include outstanding diagnostics in the injected pre-turn context only when unresolved diagnostics exist at the configured threshold
- [x] 2.5 Ensure injected guidance stays concise and avoids empty boilerplate when there is nothing useful to report

## 3. Verification

- [x] 3.1 Add or update tests for `promptSnippet`/`promptGuidelines` and pre-turn context generation
- [x] 3.2 Verify the extension still type-checks and that existing `tool_result` diagnostic behavior continues to work
- [x] 3.3 Update repo documentation if needed to describe the new semantic-first guidance behavior
