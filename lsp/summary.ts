import * as path from "node:path";
import type { ActiveCoverageSummaryEntry, OutstandingDiagnosticSummaryEntry } from "./manager.ts";

/**
 * Display form for a file path used both for human-readable LSP output and as
 * the diagnostic key. In-tree paths return the project-relative form; out-of-
 * tree paths preserve the absolute path so files in sibling worktrees or
 * monorepo packages don't collapse to a basename — that collapse used to make
 * unrelated files with the same name appear interchangeable in relevance
 * matching, and it broke diagnostic correlation for tracked external paths.
 */
export function displayRelativeFilePath(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(process.cwd(), absolutePath);
  if (relativePath === "") return path.basename(absolutePath);
  if (relativePath.startsWith(`..${path.sep}`) || relativePath === "..") {
    return absolutePath;
  }
  return relativePath;
}

export function formatCoverageSummaryText(
  entries: ActiveCoverageSummaryEntry[],
  maxServers: number,
  maxFiles: number,
): string | null {
  if (entries.length === 0) return null;

  const visible = entries.slice(0, maxServers);
  const parts = visible.map(
    (entry) => `${entry.name} (${formatOpenFiles(entry.openFiles, maxFiles)})`,
  );
  const remaining = entries.length - visible.length;
  const suffix =
    remaining > 0 ? `; +${remaining} more ${remaining === 1 ? "server" : "servers"}` : "";

  return `Active LSP coverage: ${parts.join("; ")}${suffix}.`;
}

export function formatOutstandingDiagnosticsSummaryText(
  entries: OutstandingDiagnosticSummaryEntry[],
  maxFiles: number,
): string | null {
  if (entries.length === 0) return null;

  const visible = entries.slice(0, maxFiles);
  const parts = visible.map((entry) => `${entry.file} (${formatDiagnosticCounts(entry)})`);
  const remaining = entries.length - visible.length;
  const suffix = remaining > 0 ? `; +${remaining} more ${remaining === 1 ? "file" : "files"}` : "";

  return `Outstanding LSP diagnostics: ${parts.join("; ")}${suffix}.`;
}

export function normalizeRelevantPaths(relevantPaths: string[]): string[] {
  return Array.from(new Set(relevantPaths.map(normalizeRelevantPath).filter(Boolean)));
}

/**
 * Match a file against caller-supplied relevance hints. Hints come from prompt
 * tokens and recent tool paths, so they're heterogeneous: full relative paths,
 * directory names, or bare filenames. Matching modes:
 *  - exact path match
 *  - candidate contains "/": treat as a directory prefix (`lsp/foo` ⊂ `lsp/foo/...`)
 *  - candidate has no "/" and no ".": treat as a directory name anywhere in the path
 *  - otherwise: treat as a filename and match the basename
 */
export function isPathRelevant(filePath: string, relevantPaths: string[]): boolean {
  const normalizedFilePath = normalizeRelevantPath(filePath);
  if (shouldIgnoreLspPath(normalizedFilePath)) return false;

  return relevantPaths.some((candidate) => {
    if (normalizedFilePath === candidate) return true;
    if (candidate.includes("/")) return normalizedFilePath.startsWith(`${candidate}/`);
    if (!candidate.includes(".")) {
      return (
        normalizedFilePath.startsWith(`${candidate}/`) ||
        normalizedFilePath.includes(`/${candidate}/`)
      );
    }
    return path.basename(normalizedFilePath) === candidate;
  });
}

export function shouldIgnoreLspPath(filePath: string): boolean {
  const normalized = normalizeRelevantPath(filePath);
  return (
    normalized === "node_modules" ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/node_modules/") ||
    normalized === ".pnpm" ||
    normalized.startsWith(".pnpm/") ||
    normalized.includes("/.pnpm/")
  );
}

function normalizeRelevantPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/\/$/, "").trim();
}

function formatOpenFiles(openFiles: string[], maxFiles: number): string {
  const visible = openFiles.slice(0, maxFiles);
  const remaining = openFiles.length - visible.length;
  const suffix = remaining > 0 ? `, +${remaining} more` : "";
  return `${pluralize(openFiles.length, "open file")}: ${visible.join(", ")}${suffix}`;
}

function formatDiagnosticCounts(entry: OutstandingDiagnosticSummaryEntry): string {
  const counts: string[] = [];
  if (entry.errors > 0) counts.push(pluralize(entry.errors, "error"));
  if (entry.warnings > 0) counts.push(pluralize(entry.warnings, "warning"));
  if (entry.information > 0) counts.push(pluralize(entry.information, "info"));
  if (entry.hints > 0) counts.push(pluralize(entry.hints, "hint"));
  return counts.join(", ");
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
