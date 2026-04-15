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
  const raw = getRawFilePathFromToolEvent(toolName, input);
  return raw === null ? null : normalizeTrackedPath(raw);
}

/**
 * Like getFilePathFromToolEvent but returns the unfiltered string path from
 * the tool input. Used by runtime-guidance gating, which must accept absolute
 * paths to files outside cwd (sibling worktrees, monorepo packages) since
 * read/edit/lsp all support them and they get real LSP coverage.
 */
export function getRawFilePathFromToolEvent(
  toolName: string,
  input: Record<string, unknown>,
): string | null {
  if (
    (toolName === "read" || toolName === "write" || toolName === "edit") &&
    typeof input.path === "string"
  ) {
    return input.path;
  }

  if (toolName === "lsp" && typeof input.file === "string") {
    return input.file;
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

/**
 * Convert any tool-supplied path into a stable form for tracking. In-tree
 * paths collapse to their project-relative form; out-of-tree paths preserve
 * the absolute form so sibling worktrees / monorepo packages stay in the
 * relevance set that powers `getSemanticBashBlockReason`. This mirrors
 * `displayRelativeFilePath`, so recent-paths, tracked runtime paths, and
 * diagnostic keys all share one representation. Files in dependency
 * directories (node_modules, .pnpm) are dropped so they don't crowd out real
 * source files.
 */
export function normalizeTrackedPath(filePath: string): string | null {
  const resolved = path.resolve(filePath);
  if (shouldIgnoreLspPath(resolved)) return null;
  const relative = path.relative(process.cwd(), resolved);
  if (relative === "") return path.basename(resolved);
  if (relative.startsWith(`..${path.sep}`) || relative === "..") {
    return resolved;
  }
  return relative.replaceAll(path.sep, "/");
}

/**
 * Recover the recent-paths list from previously persisted session entries.
 * Each turn that saw new paths appended a fresh `lsp-state` entry, so the
 * latest one (`.pop()`) is the authoritative snapshot — earlier entries are
 * stale superseded states, not history we want to merge.
 */
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
