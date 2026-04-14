## Context

This pi-extensions repo contains lightweight TypeScript extensions for the pi coding agent. Currently it has aliases, bash-timeout, and skill-shortcut — all simple event hooks or commands. The agent reads/edits files as raw text with no semantic understanding. Two community LSP implementations exist:

- **oh-my-pi** (`can1357`): Bun-specific agent fork with a clean LSP client layer (~160KB). Strengths: `lspmux` server multiplexing, rich TUI rendering (`render.ts`), idle timeout management, well-typed JSON-RPC transport. Limitation: tightly coupled to `@oh-my-pi/*` monorepo, Bun-only.
- **pi-lens** (`apmantza`): Full pi extension (~500KB+). Strengths: 40+ server definitions, 3 auto-install strategies, platform-aware launch, inline quality pipeline, tree-sitter/ast-grep integration. Limitation: monolithic — LSP is inseparable from formatters, linters, security scanners.

Our extension targets the sweet spot: a focused, Node-compatible LSP extension that borrows architectural ideas from both without their baggage.

## Goals / Non-Goals

**Goals:**
- Provide the agent with type-aware hover, go-to-definition, find-references, diagnostics, document-symbols, rename, and code-actions via a registered tool
- Auto-detect and spawn LSP servers for common languages (TS, Python, Rust, Go, C/C++)
- Keep documents in sync with agent edits so diagnostics reflect current state
- Surface blocking diagnostics (errors) inline after write/edit operations
- Support per-project configuration overrides (`.pi-lsp.json`)
- Stay lightweight: one extension, minimal dependencies, no build step

**Non-Goals:**
- Full quality pipeline (formatting, linting, security scanning) — that's pi-lens territory
- Tree-sitter/ast-grep integration — orthogonal concern
- Test runner integration
- Server multiplexing (lspmux) in v1 — nice-to-have for future
- TUI rendering beyond text output — pi's tool result rendering is sufficient for now
- Supporting every LSP server — start with 5-8 high-value languages, make it extensible

## Decisions

### 1. Single-file JSON-RPC transport over stdio

**Decision**: Implement a minimal JSON-RPC 2.0 client over stdin/stdout, not over TCP/socket.

**Rationale**: stdio is universally supported by LSP servers, requires no port allocation, and is the default transport for all target servers. oh-my-pi uses stdio; pi-lens uses stdio. TCP adds complexity with no benefit for our use case.

**Alternative considered**: `vscode-languageserver-protocol` npm package — rejected because it pulls in heavy VS Code abstractions we don't need. We'll define our own lean types inspired by the LSP spec.

### 2. Server lifecycle tied to session events

**Decision**: Start servers lazily on first file interaction, shut down on `session_end`. Use `pi.on("session_start")` to reset state and `pi.on("session_end")` for cleanup.

**Rationale**: oh-my-pi's idle timeout approach is elegant but premature for v1. pi-lens's session-scoped lifecycle is simpler and avoids orphan processes.

**Alternative considered**: Idle timeout (oh-my-pi pattern) — deferred to v2. Eager startup (warm all servers at session start) — rejected, wastes resources for projects touching few languages.

### 3. Config layering: defaults.json → .pi-lsp.json → env vars

**Decision**: Ship a `defaults.json` with pre-configured servers (inspired by oh-my-pi's approach). Allow per-project `.pi-lsp.json` overrides. Support `PI_LSP_DISABLED` and `PI_LSP_SERVERS` env vars.

**Rationale**: oh-my-pi's `defaults.json` + config layering is clean. pi-lens's config is complex (YAML + auto-detect + install policies). We take the simpler path with an escape hatch.

### 4. Tool registration pattern: single `lsp` tool with action parameter

**Decision**: Register one `lsp` tool with an `action` parameter (hover, definition, references, diagnostics, symbols, rename, code_action) rather than separate tools per operation.

**Rationale**: oh-my-pi uses this pattern (`lsp` tool with schema-validated actions). It keeps the tool namespace clean and lets the LLM discover all capabilities from one tool description.

**Alternative considered**: Separate tools (`lsp-hover`, `lsp-goto`, etc.) — rejected, clutters tool list. pi-lens splits into `lsp-navigation` + separate tools, which works but is less discoverable.

### 5. Diagnostic interception on write/edit

**Decision**: Hook `tool_call` events for `write` and `edit` tools. After the tool completes, sync the file content with the LSP server and collect diagnostics. Append error-level diagnostics to the tool result.

**Rationale**: This is pi-lens's core value proposition — the agent gets immediate feedback on its edits. oh-my-pi doesn't intercept edits (it's a tool-based approach only). We adopt pi-lens's interception pattern but keep it minimal — only errors, not warnings.

### 6. Node.js compatible, no Bun dependency

**Decision**: Use only `node:` built-in modules. No Bun APIs.

**Rationale**: oh-my-pi is Bun-locked (`Bun.spawn`, `Bun.file`). pi-lens uses Node and works everywhere. Our extension must work with stock pi.

## Risks / Trade-offs

- **[Server spawn failures]** → Graceful fallback: log warning, continue without LSP for that language. Never block the agent.
- **[Diagnostic noise]** → Only surface errors by default. Warnings available via `/lsp-status`. Configurable via `PI_LSP_SEVERITY` env var.
- **[Memory from long-running servers]** → Session-scoped lifecycle prevents accumulation across sessions. v2 can add idle timeout.
- **[JSON-RPC edge cases]** → Content-Length header parsing, partial reads, interleaved responses. Mitigated by using a battle-tested header parser pattern (both oh-my-pi and pi-lens have working implementations to reference).
- **[Root detection for monorepos]** → Use simple marker-file detection (package.json, Cargo.toml, go.mod, pyproject.toml). Not as sophisticated as pi-lens's per-server `RootFunction` but covers 90% of cases.
