## 1. Project Setup

- [x] 1.1 Create `lsp/` directory with entry point `lsp.ts` following existing extension pattern
- [x] 1.2 Add `./lsp/lsp.ts` to `pi.extensions` array in `package.json`
- [x] 1.3 Create `lsp/types.ts` with LSP protocol types (Position, Range, Location, Diagnostic, TextEdit, WorkspaceEdit, Hover, SymbolInformation, DocumentSymbol, CodeAction, CompletionItem)
- [x] 1.4 Create `lsp/defaults.json` with server definitions for TypeScript (`typescript-language-server`), Python (`pyright`), Rust (`rust-analyzer`), Go (`gopls`), C/C++ (`clangd`)

## 2. JSON-RPC Transport

- [x] 2.1 Create `lsp/transport.ts` with Content-Length header parser and message framer
- [x] 2.2 Implement `JsonRpcClient` class: send request (with id correlation), send notification, receive responses/notifications via buffered stdio reader
- [x] 2.3 Handle partial message buffering (accumulate chunks until full Content-Length payload received)
- [x] 2.4 Add request timeout handling (reject pending promises after configurable timeout, default 30s)

## 3. LSP Client Lifecycle

- [x] 3.1 Create `lsp/client.ts` with `LspClient` class wrapping a server process + `JsonRpcClient`
- [x] 3.2 Implement `initialize` handshake: send `initialize` request with client capabilities, wait for response, send `initialized` notification
- [x] 3.3 Implement `textDocument/didOpen` — track open documents by URI with version counter
- [x] 3.4 Implement `textDocument/didChange` (full document sync) — increment version, send full content
- [x] 3.5 Implement `textDocument/didClose` — remove from open documents tracking
- [x] 3.6 Implement `shutdown`/`exit` sequence with 5-second kill timeout
- [x] 3.7 Handle server crash (process exit/error events) — mark server unavailable, log warning

## 4. Configuration and Server Management

- [x] 4.1 Create `lsp/config.ts` — load and merge `defaults.json` with optional `.pi-lsp.json` from project root
- [x] 4.2 Implement file extension → server mapping with priority (project config > defaults)
- [x] 4.3 Implement root marker detection: search upward from file dir for configured markers (package.json, Cargo.toml, go.mod, pyproject.toml)
- [x] 4.4 Implement PATH validation: check if server command exists before spawn attempt
- [x] 4.5 Create `lsp/manager.ts` — server pool: get-or-create client per (server-name, root) pair, lazy spawn
- [x] 4.6 Support `PI_LSP_DISABLED`, `PI_LSP_SERVERS`, `PI_LSP_SEVERITY` environment variables

## 5. Diagnostic Collection

- [x] 5.1 Register `textDocument/publishDiagnostics` notification handler on each client
- [x] 5.2 Maintain per-file diagnostic store (Map<uri, Diagnostic[]>), replacing on each notification
- [x] 5.3 Implement severity filtering: separate error-level from warnings/hints
- [x] 5.4 Implement diagnostic wait: after didChange, wait up to 3 seconds for publishDiagnostics before proceeding

## 6. Tool Registration

- [x] 6.1 Define `lsp` tool schema with `action` enum (hover, definition, references, diagnostics, symbols, rename, code_actions) and parameters (file, line, character, newName, query)
- [x] 6.2 Register tool via `pi.registerTool()` with description covering all actions
- [x] 6.3 Implement `hover` action: send `textDocument/hover`, format result as markdown
- [x] 6.4 Implement `definition` action: send `textDocument/definition`, format locations as file:line:char
- [x] 6.5 Implement `references` action: send `textDocument/references`, format location list
- [x] 6.6 Implement `symbols` action: send `textDocument/documentSymbol`, format hierarchical symbol tree
- [x] 6.7 Implement `diagnostics` action: return stored diagnostics for file (or all files), formatted with severity/message/location
- [x] 6.8 Implement `rename` action: send `textDocument/rename`, return workspace edit summary
- [x] 6.9 Implement `code_actions` action: send `textDocument/codeAction`, return available actions with titles

## 7. Write/Edit Interception

- [x] 7.1 Hook `tool_call` events for `write` and `edit` tools using `pi.on("tool_call")`
- [x] 7.2 After tool completes, read file content and sync with LSP via didOpen/didChange
- [x] 7.3 Wait for diagnostics (up to 3s timeout) and filter to error-level (or configured severity)
- [x] 7.4 Append formatted error diagnostics to tool result if any found

## 8. Session Lifecycle and Commands

- [x] 8.1 Hook `session_start` to reset all state (client pool, diagnostic store, open documents)
- [x] 8.2 Hook `session_end` to shutdown all running LSP servers gracefully
- [x] 8.3 Register `/lsp-status` command: show active servers, their status (running/error/unavailable), open file count, and diagnostic summary per file

## 9. Integration and Testing

- [x] 9.1 Verify `pnpm exec tsc --noEmit` passes with all new files
- [x] 9.2 Manual test: start pi in a TypeScript project, write a file with a type error, confirm diagnostics appear
- [x] 9.3 Manual test: use `lsp` tool actions (hover, definition, references) in a real project
- [x] 9.4 Manual test: verify `/lsp-status` shows server info
- [x] 9.5 Manual test: verify clean shutdown (no orphan server processes after exit)
- [x] 9.6 Update CLAUDE.md with lsp extension documentation (env vars, commands, configuration)
