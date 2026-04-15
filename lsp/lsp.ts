// LSP Extension for pi — provides Language Server Protocol integration.
//
// Gives the agent type-aware hover, go-to-definition,
// diagnostics, document-symbols, rename, and code-actions via a registered
// `lsp` tool. It also keeps supported source files warm in their language
// servers, surfaces inline diagnostics after edits/writes, and injects concise
// semantic-first guidance into agent turns.
//
// Environment variables:
//   PI_LSP_DISABLED=1        — disable all LSP functionality
//   PI_LSP_SERVERS=a,b       — restrict to listed servers
//   PI_LSP_SEVERITY=2        — inline severity threshold (1=error, 2=warn, 3=info, 4=hint)

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { shouldBlockSemanticBashSearch } from "./bash-guard.ts";
import { loadConfig } from "./config.ts";
import {
  extractPromptPathHints,
  filterLspGuidanceMessages,
  lspPromptGuidelines,
  lspPromptSnippet,
  mergeRelevantPaths,
  runtimeGuidanceFingerprint,
} from "./guidance.ts";
import { LspManager } from "./manager.ts";
import { registerLspAwareToolOverrides } from "./overrides.ts";
import {
  persistRecentPaths,
  restoreRecentPaths,
  updateRecentPathsFromToolEvent,
} from "./recent-paths.ts";
import {
  computePendingRuntimeGuidance,
  createRuntimeGuidanceState,
  type LspRuntimeGuidanceState,
  pruneMissingTrackedPaths,
  registerQualifyingSourceInteraction,
  resetRuntimeGuidanceState,
} from "./runtime-state.ts";
import { executeAction, type LspAction, lspToolDescription } from "./tool-actions.ts";
import { type LspInspectorState, toggleLspStatusOverlay, updateLspUi } from "./ui.ts";

const LspActionEnum = Type.Union([
  Type.Literal("hover"),
  Type.Literal("definition"),
  Type.Literal("references"),
  Type.Literal("diagnostics"),
  Type.Literal("symbols"),
  Type.Literal("rename"),
  Type.Literal("code_actions"),
]);

interface LspRuntimeState {
  manager: LspManager | null;
  recentPaths: string[];
  persistedRecentPaths: string[];
  currentPrompt: string;
  currentRelevantPaths: string[];
  currentGuidanceToken: string | null;
  guidanceCounter: number;
  inlineSeverity: number;
  inspector: LspInspectorState;
  runtime: LspRuntimeGuidanceState;
}

export default function lspExtension(pi: ExtensionAPI) {
  if (process.env.PI_LSP_DISABLED === "1") {
    registerDisabledStatusCommand(pi);
    return;
  }

  const state = createRuntimeState(parseSeverity(process.env.PI_LSP_SEVERITY));

  registerLspAwareToolOverrides(pi, {
    inlineSeverity: state.inlineSeverity,
    getManager: () => state.manager,
    getRecentPaths: () => state.recentPaths,
    setRecentPaths: (paths) => {
      state.recentPaths = paths;
      refreshRelevantPaths(state);
    },
    onRecentPathsChange: () => refreshRelevantPaths(state),
  });

  registerSessionLifecycleHandlers(pi, state);
  registerBehaviorHandlers(pi, state);
  registerLspTool(pi, state);
  registerLspStatusCommand(pi, state);
}

function registerDisabledStatusCommand(pi: ExtensionAPI): void {
  pi.registerCommand("lsp-status", {
    description: "Show LSP server status",
    handler: async (_args, ctx) => {
      ctx.ui.notify("LSP is disabled (PI_LSP_DISABLED=1)", "warning");
    },
  });
}

function createRuntimeState(inlineSeverity: number): LspRuntimeState {
  return {
    manager: null,
    recentPaths: [],
    persistedRecentPaths: [],
    currentPrompt: "",
    currentRelevantPaths: [],
    currentGuidanceToken: null,
    guidanceCounter: 0,
    inlineSeverity,
    inspector: {
      handle: null,
      close: null,
    },
    runtime: createRuntimeGuidanceState(),
  };
}

function registerSessionLifecycleHandlers(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.on("session_start", async (_event, ctx) => {
    if (state.manager) {
      await state.manager.shutdownAll();
    }

    ensureLspToolActive(pi);
    state.manager = new LspManager(loadConfig(process.cwd()));
    state.recentPaths = restoreRecentPaths(
      ctx.sessionManager.getEntries() as Array<{
        type?: string;
        customType?: string;
        data?: unknown;
      }>,
    );
    state.persistedRecentPaths = [...state.recentPaths];
    state.currentPrompt = "";
    state.currentGuidanceToken = null;
    state.guidanceCounter = 0;
    resetRuntimeGuidanceState(state.runtime);
    refreshRelevantPaths(state);
    updateLspUi(ctx, state.manager, state.inlineSeverity);
  });

  pi.on("session_shutdown", async () => {
    if (state.manager) {
      await state.manager.shutdownAll();
      state.manager = null;
    }

    state.inspector.close?.();
    state.recentPaths = [];
    state.persistedRecentPaths = [];
    state.currentPrompt = "";
    state.currentRelevantPaths = [];
    state.currentGuidanceToken = null;
    resetRuntimeGuidanceState(state.runtime);
  });

  pi.on("turn_end", async () => {
    state.persistedRecentPaths = persistRecentPaths(
      pi,
      state.recentPaths,
      state.persistedRecentPaths,
    );
  });

  pi.on("agent_end", async (_event, ctx) => {
    state.currentPrompt = "";
    state.currentRelevantPaths = [];
    state.currentGuidanceToken = null;

    if (state.manager) {
      updateLspUi(ctx, state.manager, state.inlineSeverity);
    }
  });
}

function registerBehaviorHandlers(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.on("before_agent_start", async (event, ctx) => {
    ensureLspToolActive(pi);
    if (!state.manager) return;

    state.manager.pruneMissingFiles();
    pruneMissingTrackedPaths(state.runtime);
    state.currentPrompt = event.prompt;
    refreshRelevantPaths(state);
    updateLspUi(ctx, state.manager, state.inlineSeverity);

    const guidance = computePendingRuntimeGuidance(
      state.runtime,
      state.manager,
      state.inlineSeverity,
    );
    if (!guidance) return;

    const fingerprint = runtimeGuidanceFingerprint(guidance.input);

    // Refresh the stored fingerprint even when there is nothing to inject.
    // Without this, a diagnostic summary that disappears and later returns
    // identical would still match the previously injected fingerprint and be
    // silently skipped — the caller would never see the regression resurface.
    if (!guidance.content) {
      state.runtime.lastInjectedFingerprint = fingerprint;
      return;
    }

    // Pending activation always injects (one-shot ready hint) regardless of
    // fingerprint match; otherwise dedupe against the last injected snapshot.
    if (
      fingerprint === state.runtime.lastInjectedFingerprint &&
      !guidance.input.pendingActivation
    ) {
      return;
    }

    state.runtime.lastInjectedFingerprint = fingerprint;
    state.runtime.pendingActivation = false;
    state.currentGuidanceToken = `lsp-guidance-${++state.guidanceCounter}`;

    return {
      message: {
        customType: "lsp-guidance",
        content: guidance.content,
        display: false,
        details: {
          guidanceToken: state.currentGuidanceToken,
          inlineSeverity: state.inlineSeverity,
        },
      },
    };
  });

  pi.on("context", (event) => {
    const messages = filterLspGuidanceMessages(
      event.messages as Array<{ customType?: string; details?: unknown }>,
      state.currentGuidanceToken,
    ) as typeof event.messages;

    if (messages.length === event.messages.length) return;
    return { messages };
  });

  pi.on("tool_call", async (event) => {
    const reason = getSemanticBashBlockReason(event.toolName, event.input, state);
    if (reason) {
      return { block: true, reason };
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!state.manager) return;

    if (event.toolName === "lsp") {
      state.recentPaths = updateRecentPathsFromToolEvent(
        event.toolName,
        event.input,
        state.recentPaths,
      );
      refreshRelevantPaths(state);
    }

    if (isLspAwareTool(event.toolName)) {
      // Only treat successful interactions as qualifying. Failed lsp/read/edit
      // calls (e.g. invalid params, missing files) shouldn't arm runtime
      // guidance — the file may not have been touched at all.
      if (!event.isError) {
        registerQualifyingSourceInteraction(
          state.runtime,
          state.manager,
          event.toolName,
          event.input,
        );
      }
      updateLspUi(ctx, state.manager, state.inlineSeverity);
    }
  });
}

function registerLspTool(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.registerTool({
    name: "lsp",
    label: "LSP",
    description: lspToolDescription,
    promptSnippet: lspPromptSnippet,
    promptGuidelines: lspPromptGuidelines,
    parameters: Type.Object({
      action: LspActionEnum,
      file: Type.Optional(Type.String({ description: "File path (relative or absolute)" })),
      line: Type.Optional(Type.Number({ description: "1-based line number" })),
      character: Type.Optional(Type.Number({ description: "1-based column number" })),
      newName: Type.Optional(Type.String({ description: "New name (for rename action)" })),
    }),
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!state.manager) {
        return {
          content: [{ type: "text", text: "LSP not initialized. Start a new session first." }],
          details: {},
        };
      }

      const text = await executeAction(
        state.manager,
        params as {
          action: LspAction;
          file?: string;
          line?: number;
          character?: number;
          newName?: string;
        },
      );

      return {
        content: [{ type: "text", text }],
        details: {},
      };
    },
  });
}

function registerLspStatusCommand(pi: ExtensionAPI, state: LspRuntimeState): void {
  pi.registerCommand("lsp-status", {
    description: "Show active LSP servers, open files, and diagnostics",
    handler: async (_args, ctx) => {
      if (!state.manager) {
        ctx.ui.notify("LSP not initialized", "warning");
        return;
      }

      toggleLspStatusOverlay(ctx, state.manager, state.inlineSeverity, state.inspector);
    },
  });
}

function refreshRelevantPaths(state: LspRuntimeState): void {
  state.currentRelevantPaths = mergeRelevantPaths(
    extractPromptPathHints(state.currentPrompt),
    state.recentPaths,
  );
}

function getSemanticBashBlockReason(
  toolName: string,
  input: Record<string, unknown>,
  state: LspRuntimeState,
): string | null {
  if (!state.manager || toolName !== "bash") return null;
  if (typeof input.command !== "string") return null;

  const hasRelevantCoverage =
    state.currentRelevantPaths.length > 0 &&
    state.manager.getRelevantCoverageSummaryText(state.currentRelevantPaths) !== null;

  return shouldBlockSemanticBashSearch(
    input.command,
    state.currentPrompt,
    state.currentRelevantPaths,
    hasRelevantCoverage,
  );
}

function isLspAwareTool(toolName: string): boolean {
  return toolName === "lsp" || toolName === "read" || toolName === "write" || toolName === "edit";
}

function ensureLspToolActive(pi: ExtensionAPI): void {
  const activeTools = pi.getActiveTools();
  if (activeTools.includes("lsp")) return;
  pi.setActiveTools([...activeTools, "lsp"]);
}

function parseSeverity(env: string | undefined): number {
  if (!env) return 1;
  const parsed = parseInt(env, 10);
  return parsed >= 1 && parsed <= 4 ? parsed : 1;
}
