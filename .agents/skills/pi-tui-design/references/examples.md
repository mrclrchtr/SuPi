# TUI Design Examples

Complete, copy-paste component implementations. Every pattern is derived from the
official pi extension examples at `$(npm root -g)/@mariozechner/pi-coding-agent/examples/extensions/`.

## Table of Contents

- [Selection Dialog](#selection-dialog) — `SelectList` + `DynamicBorder` + keyboard hints
- [Status + Widget](#status--widget) — mode indicator in footer + list above editor
- [Loader with Cancel](#loader-with-cancel) — `BorderedLoader` + async work + abort signal
- [Settings Toggles](#settings-toggles) — `SettingsList` for multi-option configuration
- [Custom Tool Rendering](#custom-tool-rendering) — `renderCall`/`renderResult` with expandable detail
- [Custom Footer](#custom-footer) — reactive git branch + token stats
- [Vim Modal Editor](#vim-modal-editor) — `CustomEditor` subclass with normal/insert modes

---

## Selection Dialog

Standard pattern. Uses `SelectList` + `DynamicBorder` + theme-aware styling.
**Source**: `examples/extensions/preset.ts`

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pick-env", {
    description: "Select deployment environment",
    handler: async (_args, ctx) => {
      const items: SelectItem[] = [
        { value: "dev",  label: "Development",  description: "Local dev environment" },
        { value: "stg",  label: "Staging",       description: "Pre-production" },
        { value: "prod", label: "Production",    description: "Live — be careful" },
      ];

      const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        const container = new Container();

        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Text(theme.fg("accent", theme.bold(" Select Environment"))));

        const list = new SelectList(items, Math.min(items.length, 10), {
          selectedPrefix: (t) => theme.fg("accent", t),
          selectedText:   (t) => theme.fg("accent", t),
          description:    (t) => theme.fg("muted", t),
          scrollInfo:     (t) => theme.fg("dim", t),
          noMatch:        (t) => theme.fg("warning", t),
        });
        list.onSelect = (item) => done(item.value);
        list.onCancel = () => done(null);
        container.addChild(list);

        container.addChild(new Text(theme.fg("dim", " ↑↓ navigate • enter select • esc cancel")));
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

        return {
          render:      (w) => container.render(w),
          invalidate:  ()  => container.invalidate(),
          handleInput: (data) => { list.handleInput(data); tui.requestRender(); },
        };
      });

      if (result) {
        ctx.ui.notify(`Deploying to: ${result}`, "info");
      }
    },
  });
}
```

---

## Status + Widget

Persistent footer status and an above-editor widget. Both update reactively.
**Source**: `examples/extensions/plan-mode/index.ts`

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";

interface TodoItem { text: string; completed: boolean; }

export default function (pi: ExtensionAPI) {
  let enabled = false;
  let todos: TodoItem[] = [];

  function updateUI(ctx: ExtensionContext): void {
    if (!enabled) {
      ctx.ui.setStatus("my-mode", undefined);
      ctx.ui.setWidget("my-todos", undefined);
      return;
    }

    const done  = todos.filter((t) => t.completed).length;
    const total = todos.length;

    // Single-line status in footer
    ctx.ui.setStatus(
      "my-mode",
      ctx.ui.theme.fg("warning", `⏸ plan ${done}/${total}`),
    );

    // Widget above the editor
    const lines = todos.map((item) =>
      item.completed
        ? ctx.ui.theme.fg("success", "☑ ") + ctx.ui.theme.fg("muted", item.text)
        : ctx.ui.theme.fg("dim",     "☐ ") + item.text,
    );
    ctx.ui.setWidget("my-todos", lines);
  }

  pi.registerCommand("plan", {
    description: "Toggle plan mode",
    handler: (_args, ctx) => {
      enabled = !enabled;
      if (enabled) {
        todos = [
          { text: "Read codebase",    completed: false },
          { text: "Draft plan",       completed: false },
          { text: "Review with team", completed: false },
        ];
      } else {
        todos = [];
      }
      updateUI(ctx);
      ctx.ui.notify(enabled ? "Plan mode on" : "Plan mode off", "info");
    },
  });

  // Ctrl+Alt+P to toggle
  pi.registerShortcut(Key.ctrlAlt("p"), {
    description: "Toggle plan mode",
    handler: (_args, ctx) => {
      enabled = !enabled;
      updateUI(ctx);
    },
  });

  pi.on("session_start", (_event, ctx) => updateUI(ctx));
}
```

---

## Loader with Cancel

`BorderedLoader` shows a spinner and handles escape to cancel.
**Source**: `examples/extensions/qna.ts`, `examples/extensions/handoff.ts`

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("fetch-data", {
    description: "Fetch data with cancellation",
    handler: async (_args, ctx) => {
      const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        const loader = new BorderedLoader(tui, theme, "Fetching data…");
        loader.onAbort = () => done(null);

        // Do async work; respect the abort signal
        fetchSomething(loader.signal)
          .then((data) => done(data))
          .catch((err) => {
            if (err.name !== "AbortError") done(null);
          });

        return loader;
      });

      if (result === null) {
        ctx.ui.notify("Cancelled", "info");
      } else {
        ctx.ui.notify(`Got: ${result}`, "info");
      }
    },
  });
}

async function fetchSomething(signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve("some result"), 2000);
    signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("AbortError")); });
  });
}
```

---

## Settings Toggles

`SettingsList` for toggling multiple settings with keyboard navigation.
**Source**: `examples/extensions/tools.ts`

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
  const state: Record<string, string> = { verbose: "off", color: "on", compact: "off" };

  pi.registerCommand("my-settings", {
    description: "Configure extension settings",
    handler: async (_args, ctx) => {
      const items: SettingItem[] = [
        { id: "verbose", label: "Verbose mode",  currentValue: state.verbose,  values: ["on", "off"] },
        { id: "color",   label: "Color output",  currentValue: state.color,    values: ["on", "off"] },
        { id: "compact", label: "Compact layout", currentValue: state.compact, values: ["on", "off"] },
      ];

      await ctx.ui.custom((_tui, theme, _kb, done) => {
        const container = new Container();
        container.addChild(new Text(theme.fg("accent", theme.bold(" Settings")), 1, 1));

        const list = new SettingsList(
          items,
          Math.min(items.length + 2, 15),
          getSettingsListTheme(),
          (id, newValue) => {
            state[id] = newValue;
            ctx.ui.notify(`${id} = ${newValue}`, "info");
          },
          () => done(undefined), // close
          { enableSearch: true },
        );
        container.addChild(list);

        return {
          render:      (w) => container.render(w),
          invalidate:  ()  => container.invalidate(),
          handleInput: (data) => list.handleInput?.(data),
        };
      });
    },
  });
}
```

---

## Custom Tool Rendering

`renderCall` and `renderResult` give custom visuals for tool calls in the conversation.
**Source**: `examples/extensions/todo.ts`

```typescript
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

const Params = Type.Object({
  action: StringEnum(["ping", "pong"] as const),
  payload: Type.Optional(Type.String()),
});

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "Ping/pong demo tool with custom rendering",
    parameters: Params,

    async execute(_id, params, _signal, _onUpdate, _ctx) {
      return {
        content: [{ type: "text", text: `${params.action}: ${params.payload ?? "—"}` }],
        details: { action: params.action, payload: params.payload },
      };
    },

    renderCall(args, theme) {
      const label = theme.fg("toolTitle", theme.bold("my_tool ")) + theme.fg("muted", args.action);
      const extra = args.payload ? theme.fg("dim", ` "${args.payload}"`) : "";
      return new Text(label + extra, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as { action: string; payload?: string } | undefined;
      if (!details) return new Text(theme.fg("error", "no details"), 0, 0);

      let text = theme.fg("success", "✓ ") + theme.fg("muted", details.action);
      if (expanded && details.payload) {
        text += "\n" + theme.fg("dim", `payload: ${details.payload}`);
      }
      return new Text(text, 0, 0);
    },
  });
}
```

---

## Custom Footer

Replace the default footer with reactive content.
**Source**: `examples/extensions/custom-footer.ts`

```typescript
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
  let active = false;

  pi.registerCommand("my-footer", {
    description: "Toggle custom footer",
    handler: async (_args, ctx) => {
      active = !active;

      if (active) {
        ctx.ui.setFooter((tui, theme, footerData) => {
          // Reactive: re-render when git branch changes
          const unsub = footerData.onBranchChange(() => tui.requestRender());

          return {
            dispose: unsub,
            invalidate() {},
            render(width: number): string[] {
              // Compute token usage from session (already accessible)
              let input = 0, output = 0, cost = 0;
              for (const e of ctx.sessionManager.getBranch()) {
                if (e.type === "message" && e.message.role === "assistant") {
                  const m = e.message as AssistantMessage;
                  input  += m.usage.input;
                  output += m.usage.output;
                  cost   += m.usage.cost.total;
                }
              }

              const fmt    = (n: number) => n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;
              const branch = footerData.getGitBranch();
              const left   = theme.fg("dim", `↑${fmt(input)} ↓${fmt(output)} $${cost.toFixed(3)}`);
              const right  = theme.fg("dim", `${ctx.model?.id ?? "no-model"}${branch ? ` (${branch})` : ""}`);
              const gap    = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
              return [truncateToWidth(left + gap + right, width)];
            },
          };
        });
        ctx.ui.notify("Custom footer on", "info");
      } else {
        ctx.ui.setFooter(undefined);
        ctx.ui.notify("Default footer restored", "info");
      }
    },
  });
}
```

---

## Vim Modal Editor

Extend `CustomEditor` to add vim-style normal/insert modes.
**Source**: `examples/extensions/modal-editor.ts`

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

type Mode = "normal" | "insert";

class VimEditor extends CustomEditor {
  private mode: Mode = "insert";

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      if (this.mode === "insert") { this.mode = "normal"; return; }
      // In normal mode, escape aborts agent (handled by CustomEditor)
      super.handleInput(data);
      return;
    }

    if (this.mode === "insert") {
      super.handleInput(data); return;
    }

    // Normal mode — vim navigation
    switch (data) {
      case "i": this.mode = "insert"; return;
      case "h": super.handleInput("\x1b[D"); return; // left
      case "j": super.handleInput("\x1b[B"); return; // down
      case "k": super.handleInput("\x1b[A"); return; // up
      case "l": super.handleInput("\x1b[C"); return; // right
      case "0": super.handleInput("\x1b[H"); return; // home
      case "$": super.handleInput("\x1b[F"); return; // end
    }

    // Pass unhandled non-printable keys (ctrl+c, etc.) through
    if (data.length === 1 && data.charCodeAt(0) >= 32) return;
    super.handleInput(data);
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length > 0) {
      const label = this.mode === "normal" ? " NORMAL " : " INSERT ";
      const last  = lines[lines.length - 1]!;
      lines[lines.length - 1] = truncateToWidth(last, width - label.length, "") + label;
    }
    return lines;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((_tui, theme, keybindings) => new VimEditor(theme, keybindings));
  });
}
```
