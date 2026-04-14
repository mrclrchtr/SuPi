import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { shouldIgnoreLspPath } from "./summary.ts";

const LSP_STATE_ENTRY_TYPE = "lsp-state";

export function updateRecentPathsFromToolEvent(
  toolName: string,
  input: Record<string, unknown>,
  recentPaths: string[],
): string[] {
  const filePath = getFilePathFromToolEvent(toolName, input);
  return filePath ? trackRecentPath(recentPaths, filePath) : recentPaths;
}

export function getFilePathFromToolEvent(
  toolName: string,
  input: Record<string, unknown>,
): string | null {
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

export function trackRecentPath(
  recentPaths: string[],
  filePath: string,
  maxEntries: number = 6,
): string[] {
  const normalized = normalizeTrackedPath(filePath);
  if (!normalized) return recentPaths;

  const next = [normalized, ...recentPaths.filter((entry) => entry !== normalized)];
  return next.slice(0, maxEntries);
}

export function normalizeTrackedPath(filePath: string): string | null {
  const resolved = path.resolve(filePath);
  const relative = path.relative(process.cwd(), resolved);
  if (relative === "") return path.basename(resolved);
  if (relative.startsWith(`..${path.sep}`) || relative === "..") return null;

  const normalized = relative.replaceAll(path.sep, "/");
  return shouldIgnoreLspPath(normalized) ? null : normalized;
}

export function restoreRecentPaths(
  entries: Array<{ type?: string; customType?: string; data?: unknown }>,
): string[] {
  const entry = entries
    .filter(
      (candidate) => candidate.type === "custom" && candidate.customType === LSP_STATE_ENTRY_TYPE,
    )
    .pop() as { data?: { recentPaths?: unknown } } | undefined;

  return sanitizeRecentPaths(entry?.data?.recentPaths);
}

export function persistRecentPaths(
  pi: ExtensionAPI,
  recentPaths: string[],
  persistedRecentPaths: string[],
): string[] {
  const sanitized = sanitizeRecentPaths(recentPaths);
  if (samePaths(sanitized, persistedRecentPaths)) return persistedRecentPaths;

  pi.appendEntry(LSP_STATE_ENTRY_TYPE, { recentPaths: sanitized });
  return sanitized;
}

function sanitizeRecentPaths(paths: unknown, maxEntries: number = 6): string[] {
  if (!Array.isArray(paths)) return [];

  return Array.from(
    new Set(
      paths
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map(normalizeTrackedPath)
        .filter((value): value is string => value !== null),
    ),
  ).slice(0, maxEntries);
}

function samePaths(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}
