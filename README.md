# pi-extensions

Personal [pi coding agent](https://github.com/mariozechner/pi-coding-agent) extensions.

## Extensions

| Extension | Description |
|-----------|-------------|
| **aliases** | Registers `/exit` to quit pi, `/e` as a shorthand alias, and `/clear` to start a new session (alias for `/new`) |
| **bash-timeout** | Injects a default timeout on every bash tool call when the LLM omits one. Configurable via `PI_BASH_DEFAULT_TIMEOUT` (seconds, default 120). |
| **skill-shortcut** | Type `$skill-name` as a shorthand for `/skill:skill-name`. Autocomplete triggers on `$`. |
| **lsp** | Adds Language Server Protocol support for hover, definitions, references, symbols, rename, code actions, and diagnostics. It appends inline diagnostics after `write`/`edit`, advertises semantic-first tool guidance, and injects concise pre-turn LSP context based on relevant active coverage or outstanding diagnostics. |

## Install

```bash
pi install /path/to/pi-extensions
# or from git
pi install git:github.com/mrclrchtr/pi-extensions
```

When installed from a local path, pi loads the working tree directly; after edits, use `/reload` or restart pi to pick up extension changes.

## LSP extension

The `lsp` extension is meant to make pi more semantic in supported languages:

- exposes a single `lsp` tool with actions for hover, definition, references, diagnostics, symbols, rename, and code actions
- appends LSP diagnostics after `write`/`edit`
- adds semantic-first `promptSnippet` / `promptGuidelines` so the agent prefers `lsp` for code navigation and diagnostics
- injects concise pre-turn context in `before_agent_start`, favoring relevant outstanding diagnostics first and otherwise summarizing relevant active LSP coverage
- tracks prompt-mentioned and recently touched files to keep injected guidance focused
- provides `/lsp-status` for server and diagnostic visibility

Configuration:

- `PI_LSP_DISABLED=1` — disable the extension
- `PI_LSP_SERVERS=rust-analyzer,pyright` — allow-list servers
- `PI_LSP_SEVERITY=1|2|3|4` — inline diagnostic threshold
- `.pi-lsp.json` in the project root — override/add/disable server definitions

## Development

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm biome
pnpm biome:fix
pnpm biome:ci
pnpm biome:ai
pnpm test
```

Biome is configured in `biome.jsonc` with formatting, import organization, recommended lint rules, and stricter project/types/test plus aggressive complexity and nursery rules.
