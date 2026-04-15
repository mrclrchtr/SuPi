# SuPi

**Super Pi**

*The opinionated way to extend PI.*

SuPi is an opinionated extension repo for PI with LSP, Skills, marketplace compatibility, and personal best practices built in.

- SuPi is my curated extension stack for PI.
- SuPi makes PI extensible, interoperable, and sane by default.

Built for the [pi coding agent](https://github.com/mariozechner/pi-coding-agent).

## Extensions

| Extension | Description |
|-----------|-------------|
| **aliases** | Registers `/exit` to quit pi, `/e` as a shorthand alias, and `/clear` to start a new session (alias for `/new`) |
| **bash-timeout** | Injects a default timeout on every bash tool call when the LLM omits one. Configurable via `PI_BASH_DEFAULT_TIMEOUT` (seconds, default 120). |
| **skill-shortcut** | Type `$skill-name` as a shorthand for `/skill:skill-name`. Autocomplete triggers on `$`. |
| **lsp** | Adds Language Server Protocol support for hover, definitions, references, symbols, rename, code actions, and diagnostics. It appends inline diagnostics after `write`/`edit`, advertises semantic-first tool guidance, and injects stateful pre-turn guidance that activates only after the session touches a supported source file. |

## Skills

| Skill | Description |
|-------|-------------|
| **openspec-brainstorm** | Structured brainstorming for OpenSpec changes. It turns an idea into an approved change direction by exploring context, asking one question at a time, comparing approaches, and then recommending the best next OpenSpec skill before implementation starts. |

Invoke it with `/skill:openspec-brainstorm`.

## Install

```bash
pi install npm:@mrclrchtr/supi
# or from git
pi install git:github.com/mrclrchtr/SuPi
# or from a local checkout
pi install /path/to/SuPi
```

When installed from a local path, pi loads the working tree directly; after edits, use `/reload` or restart pi to pick up extension changes.

## LSP extension

The `lsp` extension is meant to make pi more semantic in supported languages:

- exposes a single `lsp` tool with actions for hover, definition, references, diagnostics, symbols, rename, and code actions
- appends LSP diagnostics after `write`/`edit`
- adds semantic-first `promptSnippet` / `promptGuidelines` so the agent prefers `lsp` for code navigation and diagnostics
- injects stateful pre-turn guidance in `before_agent_start` that stays dormant until the session successfully reads/edits/writes or runs `lsp` on a supported source file, then surfaces a one-shot activation hint, tracked-file context, and diagnostics for the tracked set — deduped across turns so unchanged state doesn't re-inject
- tracks prompt-mentioned and recently touched files to scope semantic bash-search redirection and diagnostic relevance
- provides `/lsp-status` for server and diagnostic visibility

Configuration:

- `PI_LSP_DISABLED=1` — disable the extension
- `PI_LSP_SERVERS=rust-analyzer,pyright` — allow-list servers
- `PI_LSP_SEVERITY=1|2|3|4` — inline diagnostic threshold
- `.pi-lsp.json` in the project root — override/add/disable server definitions

## Development

```bash
mise install
pnpm install
mise run hooks
pnpm typecheck
pnpm biome
pnpm biome:fix
pnpm biome:ci
pnpm biome:ai
pnpm test
pnpm pack:check
pnpm verify
hk run check # local pre-push checks (full pnpm verify)
hk run fix   # local pre-commit autofixes
```

Biome is configured in `biome.jsonc` with formatting, import organization, recommended lint rules, and stricter project/types/test plus aggressive complexity and nursery rules.

## Publishing

Pi package docs require a `pi` manifest (already present) and recommend the `pi-package` keyword for discoverability. This package publishes the TypeScript source directly — pi loads extensions without a build step.

GitHub Actions handles verification and releases:

- `CI` runs typecheck, Biome, Vitest, and `npm pack --dry-run`
- `Conventional Commits` lints PR titles and commit messages
- `Actionlint` validates GitHub Actions workflows
- `Release` runs on pushes to `main`, waits for the required checks (`verify`, `actionlint`, `commit-messages`) to succeed, then uses `semantic-release` to determine the next version, publish to npm, tag the release, and create GitHub release notes

### One-time setup

- Ensure the publishing account owns the `@mrclrchtr` npm scope
- Add an npm automation token as the `NPM_TOKEN` GitHub repository secret
- Use Conventional Commits on merges to `main` so `semantic-release` can compute versions (`feat:` = minor, `fix:` = patch, `!` / `BREAKING CHANGE:` = major)
- Be aware that semantic-release starts first stable releases at `1.0.0`

### Release flow

```bash
pnpm verify
git push origin main
```

`semantic-release` handles version calculation, tagging, npm publishing, and GitHub release notes automatically, but the GitHub release workflow will only publish after the required checks on `main` have passed. You can smoke-test the configuration locally with:

```bash
pnpm release -- --dry-run --no-ci
```

Note: local dry-runs still need git access to the GitHub remote in order to verify tagging permissions.
