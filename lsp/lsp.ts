// LSP Extension for pi — provides Language Server Protocol integration.
//
// Gives the agent type-aware hover, go-to-definition, find-references,
// diagnostics, document-symbols, rename, and code-actions via a registered
// `lsp` tool. Intercepts write/edit to surface blocking diagnostics inline.
//
// Environment variables:
//   PI_LSP_DISABLED=1        — disable all LSP functionality
//   PI_LSP_SERVERS=a,b       — restrict to listed servers
//   PI_LSP_SEVERITY=2        — inline severity threshold (1=error, 2=warn, 3=info, 4=hint)

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { loadConfig } from "./config.ts";
import { formatDiagnostics } from "./diagnostics.ts";
import { LspManager } from "./manager.ts";
import { executeAction, type LspAction, lspToolDescription } from "./tool-actions.ts";

const LspActionEnum = Type.Union([
  Type.Literal("hover"),
  Type.Literal("definition"),
  Type.Literal("references"),
  Type.Literal("diagnostics"),
  Type.Literal("symbols"),
  Type.Literal("rename"),
  Type.Literal("code_actions"),
]);

export const lspPromptSnippet =
  "Use semantic code intelligence for hover, definitions, references, symbols, rename planning, code actions, and diagnostics in supported languages.";

export const lspPromptGuidelines = [
  "Prefer the lsp tool over bash text search for supported source files when the task is semantic code navigation or diagnostics.",
  "Use lsp for hover, definitions, references, document symbols, rename planning, code actions, and diagnostics before falling back to grep-style shell search.",
  "Fall back to bash/read when LSP is unavailable, the file type is unsupported, or the task is plain-text search across docs, config files, or string literals.",
];

type PreTurnContextManager = Pick<
  LspManager,
  | "getCoverageSummaryText"
  | "getRelevantCoverageSummaryText"
  | "getOutstandingDiagnosticsSummaryText"
  | "getRelevantOutstandingDiagnosticsSummaryText"
>;

type ToolTextContent = { type: "text"; text: string };

type ToolResultPatch = {
  content?: ToolTextContent[];
  details?: unknown;
  isError?: boolean;
};

export function buildPreTurnLspContext(
  manager: PreTurnContextManager,
  inlineSeverity: number,
  relevantPaths: string[] = [],
): string | null {
  const diagnostics =
    manager.getRelevantOutstandingDiagnosticsSummaryText(relevantPaths, inlineSeverity) ??
    manager.getOutstandingDiagnosticsSummaryText(inlineSeverity);
  if (diagnostics) {
    return ["LSP guidance:", `- ${diagnostics}`].join("\n");
  }

  const coverage =
    manager.getRelevantCoverageSummaryText(relevantPaths) ?? manager.getCoverageSummaryText();
  if (!coverage) return null;

  return [
    "LSP guidance:",
    `- ${coverage}`,
    "- Prefer lsp for definitions, references, symbols, hover, rename planning, code actions, and diagnostics in those files.",
  ].join("\n");
}

export function extractPromptPathHints(prompt: string, cwd: string = process.cwd()): string[] {
  const tokens = prompt.match(/[A-Za-z0-9_./-]+/g) ?? [];
  const matches = new Set<string>();

  for (const token of tokens) {
    const candidate = normalizePromptPathHint(token);
    if (!candidate) continue;

    const resolved = path.resolve(cwd, candidate);
    if (!fs.existsSync(resolved)) continue;

    const relative = path.relative(cwd, resolved);
    if (relative === "") {
      matches.add(path.basename(resolved));
      continue;
    }

    if (!relative.startsWith(`..${path.sep}`) && relative !== "..") {
      matches.add(relative.replaceAll(path.sep, "/"));
    }
  }

  return Array.from(matches);
}

export default function lspExtension(pi: ExtensionAPI) {
  // ── guard: globally disabled ────────────────────────────────────────
  if (process.env.PI_LSP_DISABLED === "1") {
    pi.registerCommand("lsp-status", {
      description: "Show LSP server status",
      handler: async (_args, ctx) => {
        ctx.ui.notify("LSP is disabled (PI_LSP_DISABLED=1)", "warning");
      },
    });
    return;
  }

  // ── state ───────────────────────────────────────────────────────────
  let manager: LspManager | null = null;
  let recentPaths: string[] = [];
  const inlineSeverity = parseSeverity(process.env.PI_LSP_SEVERITY);

  // ── session lifecycle ───────────────────────────────────────────────
  pi.on("session_start", async (_event, _ctx) => {
    // Shut down any prior session's servers
    if (manager) {
      await manager.shutdownAll();
    }
    const config = loadConfig(process.cwd());
    manager = new LspManager(config);
    recentPaths = [];
  });

  pi.on("session_shutdown", async () => {
    if (manager) {
      await manager.shutdownAll();
      manager = null;
    }
    recentPaths = [];
  });

  pi.on("before_agent_start", async (event) => {
    if (!manager) return;

    const relevantPaths = mergeRelevantPaths(extractPromptPathHints(event.prompt), recentPaths);
    const context = buildPreTurnLspContext(manager, inlineSeverity, relevantPaths);
    if (!context) return;

    return {
      message: {
        customType: "lsp-guidance",
        content: context,
        display: false,
        details: { inlineSeverity },
      },
    };
  });

  // ── lsp tool ────────────────────────────────────────────────────────
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
      if (!manager) {
        return {
          content: [{ type: "text", text: "LSP not initialized. Start a new session first." }],
          details: {},
        };
      }
      const text = await executeAction(
        manager,
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

  // ── write/edit interception ─────────────────────────────────────────
  pi.on("tool_result", async (event) => {
    if (!manager) return;

    recentPaths = updateRecentPathsFromToolEvent(event.toolName, event.input, recentPaths);

    if (event.toolName !== "write" && event.toolName !== "edit") return;
    const filePath = getFilePathFromToolEvent(event.toolName, event.input);
    if (!filePath) return;

    return appendInlineDiagnostics(manager, filePath, inlineSeverity, event.content);
  });

  // ── /lsp-status command ─────────────────────────────────────────────
  pi.registerCommand("lsp-status", {
    description: "Show LSP server status, open files, and diagnostics",
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: simple sequential logic
    handler: async (_args, ctx) => {
      if (!manager) {
        ctx.ui.notify("LSP not initialized", "warning");
        return;
      }
      const status = manager.getStatus();
      const lines: string[] = ["## LSP Status\n"];

      if (status.servers.length === 0) {
        lines.push("No LSP servers active.\n");
      } else {
        for (const s of status.servers) {
          const icon = s.status === "running" ? "🟢" : s.status === "error" ? "🔴" : "⚪";
          lines.push(`${icon} **${s.name}** — ${s.status} (root: ${s.root})`);
          lines.push(`   Files: ${s.openFiles.join(", ") || "none"}`);
        }
      }

      const diagSummary = manager.getDiagnosticSummary();
      if (diagSummary.length > 0) {
        lines.push("\n### Diagnostics");
        for (const d of diagSummary) {
          lines.push(`- **${d.file}**: ${d.errors} error(s), ${d.warnings} warning(s)`);
        }
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}

async function appendInlineDiagnostics(
  manager: LspManager,
  filePath: string,
  inlineSeverity: number,
  content: unknown,
): Promise<ToolResultPatch | undefined> {
  try {
    const diags = await manager.syncFileAndGetDiagnostics(filePath, inlineSeverity);
    if (diags.length === 0) return;

    const existing = Array.isArray(content) ? (content as ToolTextContent[]) : [];
    const diagText = formatDiagnostics(filePath, diags);
    return {
      content: [
        ...existing,
        { type: "text" as const, text: `\n\n⚠️ LSP Diagnostics:\n${diagText}` },
      ],
    };
  } catch {
    // Never block the agent on LSP errors
    return;
  }
}

function updateRecentPathsFromToolEvent(
  toolName: string,
  input: Record<string, unknown>,
  recentPaths: string[],
): string[] {
  const filePath = getFilePathFromToolEvent(toolName, input);
  return filePath ? trackRecentPath(recentPaths, filePath) : recentPaths;
}

function getFilePathFromToolEvent(toolName: string, input: Record<string, unknown>): string | null {
  if (
    (toolName === "read" || toolName === "write" || toolName === "edit") &&
    typeof input.path === "string"
  ) {
    return normalizeTrackedPath(input.path);
  }

  if (toolName === "lsp" && typeof input.file === "string") {
    return normalizeTrackedPath(input.file);
  }

  return null;
}

function trackRecentPath(
  recentPaths: string[],
  filePath: string,
  maxEntries: number = 6,
): string[] {
  const normalized = normalizeTrackedPath(filePath);
  const next = [normalized, ...recentPaths.filter((entry) => entry !== normalized)];
  return next.slice(0, maxEntries);
}

function normalizeTrackedPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const relative = path.relative(process.cwd(), resolved);
  if (relative === "") return path.basename(resolved);
  if (relative.startsWith(`..${path.sep}`) || relative === "..") return path.basename(resolved);
  return relative.replaceAll(path.sep, "/");
}

function normalizePromptPathHint(token: string): string | null {
  const cleaned = token.replace(/^[`'"([]+|[`'"),.:;\]]+$/g, "");
  if (cleaned.length < 2) return null;
  return cleaned;
}

function mergeRelevantPaths(
  promptPaths: string[],
  recentPaths: string[],
  maxEntries: number = 8,
): string[] {
  return Array.from(new Set([...promptPaths, ...recentPaths])).slice(0, maxEntries);
}

function parseSeverity(env: string | undefined): number {
  if (!env) return 1; // default: errors only
  const n = parseInt(env, 10);
  if (n >= 1 && n <= 4) return n;
  return 1;
}
