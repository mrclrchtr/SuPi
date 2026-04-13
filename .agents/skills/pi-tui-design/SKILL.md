---
name: pi-tui-design
description: "Create distinctive, crafted TUI components for pi using @mariozechner/pi-tui and @mariozechner/pi-coding-agent. Use when building interactive terminal UIs — custom components, overlays, dialogs, dashboards, widgets, data visualizations, animated elements, game-like interfaces, or any visual TUI work inside pi extensions or custom tools. Triggers on: 'build a TUI component', 'make a dashboard', 'create an overlay', 'interactive widget', 'terminal UI', 'custom component', 'pi-tui', or any request to create visual, interactive terminal interfaces. Also use when beautifying or redesigning existing TUI components."
---

# TUI Design for Pi

Build terminal interfaces that feel *crafted*, not generated.

## Reference Sources — Read These First

```bash
PI=$(npm root -g)/@mariozechner/pi-coding-agent

# Full TUI API (component interfaces, key identifiers, rendering rules)
cat "$PI/docs/tui.md"

# Copy-paste implementations for every pattern
# (load this file when you need working code to start from)
```

Read [references/examples.md](references/examples.md) for copy-paste implementations of:
Selection Dialog · Status+Widget · Loader with Cancel · Settings Toggles · Custom Tool Rendering · Custom Footer · Vim Modal Editor

```bash
# Real-world source references (ground truth):
cat "$PI/examples/extensions/preset.ts"           # SelectList + DynamicBorder
cat "$PI/examples/extensions/todo.ts"             # renderCall / renderResult
cat "$PI/examples/extensions/plan-mode/index.ts"  # setStatus + setWidget
cat "$PI/examples/extensions/custom-footer.ts"    # setFooter reactive
cat "$PI/examples/extensions/modal-editor.ts"     # CustomEditor vim-mode
cat "$PI/examples/extensions/snake.ts"            # full game loop
cat "$PI/examples/extensions/space-invaders.ts"   # wantsKeyRelease (Kitty)
cat "$PI/examples/extensions/overlay-qa-tests.ts" # all 9 anchors + animation
```

---

## Design Thinking

Before coding, commit to a direction:

- **Tone**: Minimal and precise? Dense and information-rich? Playful? Industrial? The terminal has its own aesthetic vocabulary — box-drawing elegance, braille-pattern density, block-element weight, symbol clarity.
- **Scope**: Full-screen takeover? Floating overlay? Persistent widget? Status line? Tool rendering? Match the delivery surface to the interaction weight.
- **Differentiation**: What detail makes this feel intentional? A progress bar with braille resolution. Aligned columns with accent headers. A dialog with breathing room.

## Terminal Aesthetic Vocabulary

| Category | Characters | Use |
|----------|-----------|-----|
| Box-drawing (light) | `─│┌┐└┘├┤┬┴┼` | Standard borders, tables |
| Box-drawing (rounded) | `╭╮╰╯` | Softer, modern feel |
| Box-drawing (heavy) | `━┃┏┓┗┛┣┫┳┻╋` | Emphasis, headers |
| Box-drawing (double) | `═║╔╗╚╝╠╣╦╩╬` | Formal, structured |
| Block elements | `█▓▒░▀▄▌▐` | Progress bars, density, fill |
| Braille | `⠀–⣿` | Sparklines, high-res patterns, spinners |
| Symbols | `◆●○◉✓✗▸▶★` | Status, bullets, selections |

**Weight hierarchy**: `█` → `▓` → `▒` → `░` → ` `. Use for density gradients, not just fill.

**Aspect ratio**: Terminal cells are ~2:1 tall. `██` reads as roughly square — account for this in spatial layouts (`snake.ts` uses `cellWidth = 2`).

## Color Discipline

**Always use theme tokens.** Hardcoded ANSI escapes break on theme change.

```typescript
// ✗ breaks on theme change
`\x1b[31m${text}\x1b[0m`

// ✓ adapts to dark/light/custom
theme.fg("accent", theme.bold("Title"))
theme.fg("success", "✓ OK")
theme.fg("muted",   "secondary info")
```

**Foreground hierarchy** (`theme.fg(color, text)`):
`accent` → primary attention · `text` → body · `muted` → secondary · `dim` → tertiary
`success` / `error` / `warning` → semantic · `border` / `borderAccent` / `borderMuted` → structural
`toolTitle` / `toolOutput` → tool contexts

**Background** (`theme.bg(color, text)`):
`selectedBg` · `toolPendingBg` · `toolSuccessBg` · `toolErrorBg` · `userMessageBg` · `customMessageBg`

**Rule**: one accent dominates. Overusing color flattens the hierarchy — a wall of green is worse than no color.

## Spatial Composition

- Every line from `render()` must not exceed the `width` parameter — use `truncateToWidth()`
- `paddingX=1` is the baseline; headers may use `paddingX=2`
- `Spacer(1)` between sections beats a separator line — let content breathe
- Compose: `Container → Box → children`. Don't flatten into one render function
- Use `visibleWidth()` for ANSI-aware column math, not `str.length`

## Animation

Timer-based via `setInterval` + `tui.requestRender()`. Braille spinner:

```typescript
const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
this.interval = setInterval(() => {
  this.frame = (this.frame + 1) % frames.length;
  this.invalidate();
  tui.requestRender();
}, 80);
```

**Mandatory**: clear intervals in `dispose()`. Leaked timers render after component removal.

## Keyboard Conventions

Standard keys users expect: `↑↓`/`j/k` navigate · `Enter` confirm · `Escape` cancel · `Tab` next field.

Always show hints: `theme.fg("dim", "↑↓ navigate • enter select • esc cancel")`

Use `matchesKey(data, Key.up)` — handles terminal escape sequence differences. See `tui.md` for all `Key.*` identifiers.

## Component Contract

```typescript
interface Component {
  render(width: number): string[];  // each line must not exceed width
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;        // Kitty key-release events (space-invaders.ts)
  invalidate(): void;               // clear render cache; called on theme change
}
```

**Caching** — always cache, invalidate on state change:

```typescript
private cachedWidth?: number;
private cachedLines?: string[];

render(width: number): string[] {
  if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
  // ... compute ...
  this.cachedWidth = width; this.cachedLines = lines;
  return lines;
}
invalidate(): void { this.cachedWidth = undefined; this.cachedLines = undefined; }
```

**Theme invalidation** — components that pre-bake theme colors must rebuild on `invalidate()`:

```typescript
override invalidate(): void {
  super.invalidate();   // clears child caches
  this.rebuild();       // re-applies current theme colors
}
```

## Available Components

For full API (constructor signatures, options, examples) → read `tui.md`.

**From `@mariozechner/pi-tui`**: `Text` · `TruncatedText` · `Box` · `Container` · `Spacer` · `Markdown` · `Image` · `SelectList` · `SettingsList` · `Loader` · `Input` · `Editor`

**From `@mariozechner/pi-coding-agent`**: `DynamicBorder` · `BorderedLoader` · `CustomEditor`

**Utilities**: `visibleWidth` · `truncateToWidth` · `wrapTextWithAnsi` · `matchesKey` · `Key` · `getMarkdownTheme` · `getSettingsListTheme` · `getAgentDir`

> `SelectList`, `SettingsList`, `BorderedLoader` cover 90% of cases — use them before building from scratch.

## Delivery Surfaces

| Surface | API | When |
|---------|-----|------|
| Full-screen | `ctx.ui.custom(factory)` | Games, dashboards, wizards |
| Overlay | `ctx.ui.custom(factory, { overlay: true, overlayOptions })` | Pickers, confirmations, panels |
| Widget | `ctx.ui.setWidget(id, lines \| factory, opts?)` | Persistent status above/below editor |
| Status | `ctx.ui.setStatus(id, content \| undefined)` | Single-line footer indicator |
| Tool render | `renderCall` / `renderResult` on `registerTool` | Custom tool visuals in conversation |
| Footer | `ctx.ui.setFooter(factory \| undefined)` | Replace entire footer bar |
| Editor | `ctx.ui.setEditorComponent(factory \| undefined)` | Modal editing, custom keybindings |

For `overlayOptions` (anchor, width, minWidth, maxHeight, margin, visible, offsetX/Y) → read `tui.md` overlays section or see `overlay-qa-tests.ts`.

`ctx.ui.custom` factory signature: `(tui, theme, keybindings, done) => Component | { render, invalidate, handleInput }`

## Key Rules

1. **Use `theme` from the callback** — not imported directly
2. **Type `DynamicBorder` callback** — `(s: string) => theme.fg("accent", s)`, not `(s) => ...`
3. **Call `tui.requestRender()`** after state changes in `handleInput`
4. **Return `{ render, invalidate, handleInput }`** or a class with those methods
5. **Use existing components** — don't rebuild `SelectList` / `SettingsList` / `BorderedLoader`
6. **Fresh instances for overlays** — overlays are disposed on close; don't reuse references

## Config Persistence

Use `getAgentDir()` for `~/.pi/agent/` — the standard location:

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

const dir = join(getAgentDir(), "extensions", "my-ext");
const file = join(dir, "settings.json");
const defaults = { enabled: true };

function load() { return existsSync(file) ? { ...defaults, ...JSON.parse(readFileSync(file, "utf-8")) } : defaults; }
function save(patch: object) { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify({ ...load(), ...patch }, null, 2)); }
```

## Anti-Patterns

| Don't | Do |
|-------|-----|
| `\x1b[31m` hardcoded color | `theme.fg("error", ...)` |
| Lines exceeding `width` | `truncateToWidth()` on every line |
| No `invalidate()` after state change | Clear cache, call `tui.requestRender()` |
| Ignoring 2:1 cell aspect ratio | Double-width chars for "square" shapes |
| Unstructured wall of text | Spacer + borders + alignment |
| No keyboard hints | Footer dim line with available keys |
| Leaked `setInterval` | `dispose()` with cleanup |
| Pre-baked theme colors without rebuild | Override `invalidate()` to rebuild |
| Flat render function | `Container → Box → children` |
| Reusing a disposed overlay | Create fresh instance per invocation |
| `(s) =>` on DynamicBorder | `(s: string) =>` — TypeScript requires it |
