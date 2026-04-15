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

type DiagnosticsManager = Pick<LspManager, "getRelevantOutstandingDiagnosticsSummaryText">;

type GuidanceMessageLike = {
  customType?: string;
  details?: unknown;
};

export interface RuntimeGuidanceInput {
  pendingActivation: boolean;
  diagnosticsSummary: string | null;
  trackedFiles: string[];
}

export function computeTrackedDiagnosticsSummary(
  manager: DiagnosticsManager,
  inlineSeverity: number,
  trackedPaths: string[],
): string | null {
  if (trackedPaths.length === 0) return null;
  return manager.getRelevantOutstandingDiagnosticsSummaryText(trackedPaths, inlineSeverity);
}

export function buildRuntimeLspGuidance(input: RuntimeGuidanceInput): string | null {
  const lines: string[] = [];
  const fileHint = summarizeTrackedFiles(input.trackedFiles);

  if (input.pendingActivation) {
    lines.push(
      fileHint
        ? `LSP ready for semantic navigation on tracked source files (${fileHint}).`
        : "LSP ready for semantic navigation on the tracked source files.",
    );
  } else if (fileHint) {
    // After activation, surface the current tracked-file context so the agent
    // sees newly touched supported source files reflected in runtime guidance.
    // Dedup is the caller's job (fingerprint match → skip).
    lines.push(`LSP tracking source files: ${fileHint}.`);
  }

  if (input.diagnosticsSummary) {
    lines.push(input.diagnosticsSummary);
  }

  if (lines.length === 0) return null;

  return ["LSP guidance:", ...lines.map((line) => `- ${line}`)].join("\n");
}

/**
 * Fingerprint captures the parts of runtime guidance that persist across turns
 * — tracked source-file set and tracked diagnostics summary. `pendingActivation`
 * is a one-shot signal cleared after injection, so it's excluded; otherwise an
 * unchanged-state turn would never match the previously stored fingerprint.
 * Tracked files are included so newly opened supported files re-trigger
 * guidance even when diagnostics are unchanged.
 */
export function runtimeGuidanceFingerprint(input: RuntimeGuidanceInput): string {
  // Canonicalize by sorting: registerQualifyingSourceInteraction moves the most
  // recent file to the front of trackedSourcePaths, so an order-sensitive join
  // would treat re-touching an already-tracked file as a state change and
  // re-inject guidance during ordinary back-and-forth edits.
  const canonical = [...input.trackedFiles].sort().join("|");
  return `${canonical}\u0000${input.diagnosticsSummary ?? ""}`;
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

function summarizeTrackedFiles(files: string[], maxFiles: number = 2): string {
  if (files.length === 0) return "";
  const shown = files.slice(0, maxFiles).join(", ");
  const remaining = files.length - maxFiles;
  return remaining > 0 ? `${shown}, +${remaining} more` : shown;
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
