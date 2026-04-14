# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Personal extensions for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent) (`@mariozechner/pi-coding-agent`). Extensions are loaded directly as TypeScript by pi — there is no build step.

Extensions sourced from [joelhooks/pi-tools](https://github.com/joelhooks/pi-tools).

Install into pi:
```bash
pi install /path/to/pi-extensions
# or
pi install git:github.com/mrclrchtr/pi-extensions
```

## Commands

```bash
# Install dependencies
pnpm install

# Type-check all extensions (no emit)
pnpm exec tsc --noEmit

# Lint/format check (AI-friendly output)
pnpm biome:ai

# Auto-fix lint/format issues, then verify
pnpm biome:fix && pnpm biome:ai

# Fix formatting/imports on only the files you touched
pnpm exec biome check --write <files...>

# Scannable biome error list (one line per issue)
pnpm biome:ci --colors=off 2>&1 | grep '\.ts:'

# Run all tests (unit + integration)
pnpm test

# Fast smoke test for LSP guidance/relevance changes
pnpm exec vitest run lsp/__tests__/guidance.test.ts

# Watch mode
pnpm test:watch
```

Toolchain versions are managed via mise (`node = "lts"`, `pnpm = "latest"`).

## Architecture

Each extension lives in its own directory with a single `.ts` entry file. Extensions are registered in `package.json` under `pi.extensions`. Prompt templates live in `prompts/*.md` and are registered under `pi.prompts`:

```json
"pi": {
  "extensions": [
    "./aliases/aliases.ts",
    "./bash-timeout/index.ts",
    "./skill-shortcut/skill-shortcut.ts",
    "./lsp/lsp.ts"
  ],
  "prompts": [
    "./prompts"
  ]
}
```

### Prompt templates

Templates live in `prompts/*.md` and are invoked with `/name` in the pi editor. Only `description:` is valid frontmatter — `allowed-tools` and other Claude-specific keys are silently ignored.

### Skills

Skills live in `skills/<name>/SKILL.md`. Registered via `pi.skills: ["./skills"]` in `package.json`. Naming rules (violations silently skip loading): lowercase + hyphens only, ≤ 64 chars, must match parent directory name, no leading/trailing/consecutive hyphens, `description:` frontmatter is required. Progressive disclosure: `description` always in context → `SKILL.md` loads on invocation → `references/*.md` loads on demand. Keep `SKILL.md` as opinionated guide + read-pointers; put copy-paste code in `references/`.

### Extension shape

Every extension is a default-exported function that receives the `ExtensionAPI`:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // register commands, event hooks, etc.
}
```

### Key API surface

- `pi.registerCommand(name, { description, handler })` — adds a `/name` slash command
- `pi.on("session_start", (event, ctx) => …)` — fires when a session begins
- `pi.on("tool_call", async (event) => …)` — intercepts LLM tool calls; mutate `event.input` to override parameters
- `pi.on("input", (event) => …)` — intercepts user input before agent processing; return `{ action: "transform", text }` to rewrite it or `{ action: "continue" }` to pass through
- `pi.on("before_agent_start", (event) => …)` — inject per-turn steering/context; use `message.display = false` for hidden guidance
- `pi.getCommands()` — returns all registered commands; `c.source === "skill"` identifies skill commands
- `ctx.shutdown()` — exits the session
- `ctx.ui.setWidget(id, lines)` — shows/clears a persistent UI widget
- `ctx.ui.notify(message, level)` — one-shot notification
- `ctx.ui.setEditorComponent(factory)` — replaces the prompt editor component
- `pi.registerTool({ name, label, description, parameters, execute })` — registers a custom tool; `parameters` uses `Type.Object()` from `@sinclair/typebox`; `execute(toolCallId, params, signal, onUpdate, ctx)` returns `{ content, details }`
- `pi.on("tool_result", async (event, ctx) => …)` — runs after tool execution; return `{ content }` to patch result
- `pi.on("session_shutdown", async () => …)` — fires before session teardown; clean up subprocesses here

### LSP extension

Provides Language Server Protocol integration — type-aware hover, go-to-definition, find-references, diagnostics, rename, code-actions, and document-symbols via a registered `lsp` tool. Intercepts `write`/`edit` to surface blocking diagnostics inline. The tool also advertises semantic-first guidance via `promptSnippet`/`promptGuidelines` and injects compact pre-turn LSP coverage + outstanding diagnostics context in `before_agent_start`.

Files: `lsp/lsp.ts` (entry), `lsp/client.ts` (LSP client lifecycle), `lsp/transport.ts` (JSON-RPC), `lsp/config.ts` (server config), `lsp/manager.ts` (server pool), `lsp/tool-actions.ts` (tool dispatch), `lsp/diagnostics.ts` (formatting), `lsp/utils.ts` (URI/language/path utils), `lsp/types.ts` (LSP types), `lsp/defaults.json` (server definitions).

Commands: `/lsp-status` — shows active servers, open files, and diagnostics summary.

Per-project config: `.pi-lsp.json` in project root to override/add/disable servers. YAML is not supported (no YAML parser dependency).

### Skill-shortcut extension

The most complex extension. It wraps pi-tui's `AutocompleteProvider` and `CustomEditor` to intercept `$name` tokens and expand them to `/skill:name`. The editor subclass (`SkillShortcutEditor`) delegates autocomplete to the inner provider unless the cursor is inside a `$`-prefixed token.

### Environment variables honored

| Variable | Extension | Effect |
|---|---|---|
| `PI_BASH_DEFAULT_TIMEOUT` | bash-timeout | Overrides default timeout in seconds (default: 120) |
| `PI_LSP_DISABLED` | lsp | Set to `1` to disable all LSP functionality |
| `PI_LSP_SERVERS` | lsp | Comma-separated allow-list of server names (e.g., `rust-analyzer,pyright`) |
| `PI_LSP_SEVERITY` | lsp | Inline severity threshold: `1`=errors only (default), `2`=+warnings, `3`=+info, `4`=+hints |

## Reading pi docs

All pi documentation is installed alongside the package:

```bash
# Docs (markdown)
ls $(npm root -g)/@mariozechner/pi-coding-agent/docs/
# Examples (working TypeScript)
ls $(npm root -g)/@mariozechner/pi-coding-agent/examples/
# README
cat $(npm root -g)/@mariozechner/pi-coding-agent/README.md
```

With mise the resolved path is:
`~/.local/share/mise/installs/node/<version>/lib/node_modules/@mariozechner/pi-coding-agent/`

Key docs to reach for first:
- `docs/extensions.md` — extension API reference
- `docs/prompt-templates.md` — template format and loading rules
- `docs/packages.md` — `package.json` `pi.*` keys (`extensions`, `prompts`, `skills`, …)
- `docs/skills.md` — skill structure, frontmatter rules, loading order
- `docs/tui.md` — TUI component API (needed for `skill-shortcut`-style work)
- `examples/extensions/` — working reference implementations

## Gotchas

- **peerDependencies install as regular deps**: pnpm installs missing peers automatically; after bumping version ranges in `package.json` run `pnpm install` to update the lockfile.
- **`~` version range on peerDeps**: intentional — pins to the minor release train (`~0.66.0` allows `0.66.x` only) to avoid silent breakage from pi API changes across minor versions.
- **`skill-shortcut` accesses private TUI internals**: `SkillShortcutEditor` casts `this as any` to reach `autocompleteState`, `state`, and `tryTriggerAutocomplete`. These are undocumented internals and may break on `@mariozechner/pi-tui` upgrades — verify after bumping.
- **`bash-timeout` entry point is `index.ts`**: all other extensions use `dir/dir.ts` naming; `bash-timeout` uses `bash-timeout/index.ts`. This is intentional (copied from source) but inconsistent.
- **Prompt template frontmatter**: only `description:` is supported; Claude-specific keys like `allowed-tools` are silently ignored — strip them when porting Claude commands.
- **`@sinclair/typebox` is a peerDependency**: it's a runtime import (used by `lsp/lsp.ts`) so it must be in `peerDependencies`. pnpm auto-installs it locally for type-checking. Putting it in `devDependencies` breaks `pi install npm:...`. Avoid `@mariozechner/pi-ai`'s `StringEnum` — use `Type.Union(Type.Literal(...))` instead to keep the dep tree smaller.
- **`ctx.ui.notify()` level is `"warning"` not `"warn"`**: valid values are `"error" | "warning" | "info"`.
- **`pi.on("tool_result")` modifies results; `pi.on("tool_call")` only blocks**: use `tool_result` to append diagnostics or context to tool output. Return `{ content, details, isError }` to patch.
- **Session cleanup event is `session_shutdown`** not `session_end`: use for tearing down subprocesses, connections, etc.
- **Local `pi install /path` uses the working tree directly**: confirm the active package path in `~/.pi/agent/settings.json`, then use `/reload` or restart pi after edits.
- **JSON imports**: avoid `import X from "./file.json" with { type: "json" }` — it errors under some tsconfig modes. Use `JSON.parse(fs.readFileSync(path.join(__dirname, "file.json"), "utf-8"))` instead. pi's jiti loader always provides `__dirname`.
- **openspec PostHog errors are harmless**: the CLI emits `PostHogFetchNetworkError` when offline — ignore.
- **Biome config is `biome.jsonc`** (not `biome.json`): all rule overrides go there. Inline `biome-ignore` comments don't work for file-level nursery rules like `noExcessiveLinesPerFile` — must split the file or raise the threshold in `biome.jsonc`.
- **Prefer `Type.Union(Type.Literal(...))` over `StringEnum`**: avoids adding `@mariozechner/pi-ai` as a runtime/peer dep. Only `@sinclair/typebox` is needed for tool parameter schemas.
- **`skill-shortcut` needs `biome-ignore` for `noExplicitAny`**: the `as any` casts accessing private TUI internals are intentional — each needs an inline `// biome-ignore lint/suspicious/noExplicitAny: accessing private TUI internals` comment.
- **Test framework is vitest**: unit tests at `lsp/__tests__/*.test.ts`, integration tests at `*.integration.test.ts`. Integration tests use `describe.skipIf(!HAS_CMD)` to auto-skip when LSP servers aren't on PATH.
- **Always run `biome check --write` on new test files**: biome enforces import order and formatting that won't match hand-written code. Fix first, then verify with `biome:ai`.
- **Biome complexity trips quickly in `lsp/manager.ts`**: prefer small helper functions for summary/aggregation logic before reaching for suppressions.
- **`lsp/summary.ts` holds formatting/relevance helpers**: keep `lsp/manager.ts` focused on state/server management to stay under Biome file-length limits.
- **Keep `before_agent_start` guidance stateful**: generic LSP preference belongs in `promptSnippet`/`promptGuidelines`; pre-turn messages should only add actionable diagnostics or relevant active coverage.
- **Probe live LSP behavior with a temporary TS error file**: writing `lsp/__tmp_guidance_probe.ts` with an intentional type error exercises both `tool_result` diagnostics and pre-turn guidance.
- **Unit-test LSP manager summaries with fake clients**: cast `manager as unknown as { clients: Map<...> }` to seed coverage/diagnostics; keep real server behavior in `*.integration.test.ts`.
- **Unhandled promise rejections fail vitest**: if production code rejects promises during cleanup (e.g., `dispose()`), add `promise.catch(() => {})` at creation to prevent vitest from catching them as test errors.
