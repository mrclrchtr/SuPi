## Why

The pi coding agent lacks LSP (Language Server Protocol) integration — it reads and edits files as raw text with no type-checking, go-to-definition, diagnostics, or symbol awareness. Two community implementations exist (`oh-my-pi/lsp` and `pi-lens`) with complementary strengths: oh-my-pi has a clean LSP client with server multiplexing and rich TUI rendering, while pi-lens has broader server coverage, auto-install strategies, and inline quality feedback. Neither is reusable as a lightweight, focused LSP extension for this repo. Building a new extension that cherry-picks the best ideas from both fills this gap.

## What Changes

- Add a new `lsp/` extension directory with a pi extension that manages LSP server lifecycle, document sync, and diagnostic collection
- Register an `lsp` custom tool exposing hover, go-to-definition, find-references, diagnostics, document-symbols, rename, and code-actions to the agent
- Intercept `write`/`edit` tool calls to sync document state with running LSP servers and surface blocking diagnostics inline
- Ship a configurable `lsp.yaml` with pre-configured server definitions for common languages (TypeScript, Python, Rust, Go, C/C++) with auto-detection
- Add `/lsp-status` command showing active servers, diagnostics summary, and server health
- Support per-project server configuration via `.pi-lsp.json` in project root

## Capabilities

### New Capabilities
- `lsp-client`: Core LSP client lifecycle — spawn, initialize, sync, shutdown servers; JSON-RPC transport; document synchronization
- `lsp-tool`: Agent-facing tool registration — hover, definitions, references, symbols, diagnostics, rename, code-actions as tool operations
- `lsp-diagnostics`: Inline diagnostic feedback — intercept write/edit, collect diagnostics, surface errors/warnings to the agent
- `lsp-config`: Server configuration and auto-detection — default server definitions, per-project overrides, language-to-server mapping

### Modified Capabilities
<!-- No existing specs to modify — this is a greenfield addition -->

## Impact

- **New files**: `lsp/` directory with extension entry point, client, config, tool, and diagnostics modules
- **package.json**: New extension entry added to `pi.extensions` array
- **Dependencies**: `vscode-jsonrpc` / `vscode-languageserver-protocol` as peer or bundled dependency for LSP types
- **Runtime**: Spawns LSP server subprocesses; needs cleanup on session end
- **Existing extensions**: No changes to aliases, bash-timeout, or skill-shortcut
