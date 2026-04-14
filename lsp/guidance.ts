import * as fs from "node:fs";
import * as path from "node:path";
import type { LspManager } from "./manager.ts";

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

type GuidanceMessageLike = {
  customType?: string;
  details?: unknown;
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

export function mergeRelevantPaths(
  promptPaths: string[],
  recentPaths: string[],
  maxEntries: number = 8,
): string[] {
  return Array.from(new Set([...promptPaths, ...recentPaths])).slice(0, maxEntries);
}

export function filterLspGuidanceMessages<T extends GuidanceMessageLike>(
  messages: T[],
  activeGuidanceToken: string | null,
): T[] {
  return messages.filter((message) => {
    if (message.customType !== "lsp-guidance") return true;
    if (!activeGuidanceToken) return false;
    return getGuidanceToken(message.details) === activeGuidanceToken;
  });
}

function getGuidanceToken(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const token = (details as { guidanceToken?: unknown }).guidanceToken;
  return typeof token === "string" ? token : null;
}

function normalizePromptPathHint(token: string): string | null {
  const cleaned = token.replace(/^[`'"([]+|[`'"),.:;\]]+$/g, "");
  if (cleaned.length < 2) return null;
  return cleaned;
}
