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
```

Toolchain versions are managed via mise (`node = "lts"`, `pnpm = "latest"`).

## Architecture

Each extension lives in its own directory with a single `.ts` entry file. Extensions are registered in `package.json` under `pi.extensions`. Prompt templates live in `prompts/*.md` and are registered under `pi.prompts`:

```json
"pi": {
  "extensions": [
    "./aliases/aliases.ts",
    "./update-notifier/update-notifier.ts",
    "./bash-timeout/index.ts",
    "./skill-shortcut/skill-shortcut.ts"
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
- `pi.getCommands()` — returns all registered commands; `c.source === "skill"` identifies skill commands
- `ctx.shutdown()` — exits the session
- `ctx.ui.setWidget(id, lines)` — shows/clears a persistent UI widget
- `ctx.ui.notify(message, level)` — one-shot notification
- `ctx.ui.setEditorComponent(factory)` — replaces the prompt editor component

### Skill-shortcut extension

The most complex extension. It wraps pi-tui's `AutocompleteProvider` and `CustomEditor` to intercept `$name` tokens and expand them to `/skill:name`. The editor subclass (`SkillShortcutEditor`) delegates autocomplete to the inner provider unless the cursor is inside a `$`-prefixed token.

### Environment variables honored

| Variable | Extension | Effect |
|---|---|---|
| `PI_SKIP_AUTO_UPDATE` | update-notifier | Disables startup version check |
| `PI_BASH_DEFAULT_TIMEOUT` | bash-timeout | Overrides default timeout in seconds (default: 120) |

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
