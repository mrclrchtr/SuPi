// LSP Manager — server pool with lazy spawning and diagnostic collection.

import * as fs from "node:fs";
import * as path from "node:path";
import { LspClient } from "./client.ts";
import { getServerForFile } from "./config.ts";
import {
  displayRelativeFilePath,
  formatCoverageSummaryText,
  formatOutstandingDiagnosticsSummaryText,
  isPathRelevant,
  normalizeRelevantPaths,
} from "./summary.ts";
import { type Diagnostic, DiagnosticSeverity, type LspConfig } from "./types.ts";
import { commandExists, findProjectRoot } from "./utils.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface ServerStatus {
  name: string;
  status: "running" | "error" | "unavailable";
  root: string;
  openFiles: string[];
}

export interface DiagnosticSummary {
  file: string;
  errors: number;
  warnings: number;
}

export interface CoverageSummaryEntry {
  name: string;
  fileTypes: string[];
  active: boolean;
  openFiles: number;
}

export interface ActiveCoverageSummaryEntry {
  name: string;
  openFiles: string[];
}

export interface OutstandingDiagnosticSummaryEntry {
  file: string;
  total: number;
  errors: number;
  warnings: number;
  information: number;
  hints: number;
}

export interface ManagerStatus {
  servers: ServerStatus[];
}

// ── LspManager ────────────────────────────────────────────────────────

export class LspManager {
  /** Active clients keyed by "serverName:root" */
  private clients = new Map<string, LspClient>();
  /** Servers we've already tried and failed to start */
  private unavailable = new Set<string>();

  constructor(private readonly config: LspConfig) {}

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Get or create an LSP client for the given file.
   * Returns null if no server is configured or available.
   */
  async getClientForFile(filePath: string): Promise<LspClient | null> {
    const match = getServerForFile(this.config, filePath);
    if (!match) return null;

    const [serverName, serverConfig] = match;

    // Find project root
    const fileDir = path.dirname(path.resolve(filePath));
    const root = findProjectRoot(fileDir, serverConfig.rootMarkers, process.cwd());
    const key = `${serverName}:${root}`;

    // Check if unavailable
    if (this.unavailable.has(key)) return null;

    // Return existing client
    const existing = this.clients.get(key);
    if (existing && existing.status === "running") return existing;

    // If existing client errored, remove it
    if (existing && existing.status === "error") {
      this.clients.delete(key);
      this.unavailable.add(key);
      return null;
    }

    // Validate command exists
    if (!commandExists(serverConfig.command)) {
      this.unavailable.add(key);
      return null;
    }

    // Spawn new client
    const client = new LspClient(serverName, serverConfig, root);
    this.clients.set(key, client);

    try {
      await client.start();
      return client;
    } catch (_err) {
      this.unavailable.add(key);
      this.clients.delete(key);
      return null;
    }
  }

  /**
   * Sync a file with its LSP server and wait for diagnostics.
   * Returns diagnostics filtered to the given severity threshold.
   */
  async syncFileAndGetDiagnostics(
    filePath: string,
    maxSeverity: number = 1,
  ): Promise<Diagnostic[]> {
    const client = await this.getClientForFile(filePath);
    if (!client) return [];

    const resolvedPath = path.resolve(filePath);
    let content: string;
    try {
      content = fs.readFileSync(resolvedPath, "utf-8");
    } catch {
      return [];
    }

    const diagnostics = await client.syncAndWaitForDiagnostics(resolvedPath, content);
    return diagnostics.filter((d) => d.severity !== undefined && d.severity <= maxSeverity);
  }

  /** Shut down all running LSP servers. */
  async shutdownAll(): Promise<void> {
    const shutdowns = Array.from(this.clients.values()).map((c) => c.shutdown().catch(() => {}));
    await Promise.all(shutdowns);
    this.clients.clear();
    this.unavailable.clear();
  }

  /** Get status of all servers. */
  getStatus(): ManagerStatus {
    const servers: ServerStatus[] = [];
    for (const [_key, client] of this.clients) {
      servers.push({
        name: client.name,
        status: client.status === "running" ? "running" : "error",
        root: client.root,
        openFiles: client.openFiles,
      });
    }
    return { servers };
  }

  /** Get configured and active LSP coverage for the current project. */
  getCoverageSummary(): CoverageSummaryEntry[] {
    const activeServers = new Map<string, { active: boolean; openFiles: number }>();

    for (const server of this.getStatus().servers) {
      const current = activeServers.get(server.name) ?? { active: false, openFiles: 0 };
      current.active = current.active || server.status === "running";
      current.openFiles += server.openFiles.length;
      activeServers.set(server.name, current);
    }

    return Object.entries(this.config.servers)
      .map(([name, server]) => {
        const activity = activeServers.get(name);
        return {
          name,
          fileTypes: server.fileTypes,
          active: activity?.active ?? false,
          openFiles: activity?.openFiles ?? 0,
        } satisfies CoverageSummaryEntry;
      })
      .sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          b.openFiles - a.openFiles ||
          a.name.localeCompare(b.name),
      );
  }

  /** Get active LSP coverage summarized by running servers with open files. */
  getActiveCoverageSummary(): ActiveCoverageSummaryEntry[] {
    const activeServers = new Map<string, Set<string>>();

    for (const server of this.getStatus().servers) {
      if (server.status !== "running" || server.openFiles.length === 0) continue;

      const openFiles = activeServers.get(server.name) ?? new Set<string>();
      for (const file of server.openFiles) {
        openFiles.add(displayRelativeFilePath(file));
      }
      activeServers.set(server.name, openFiles);
    }

    return Array.from(activeServers.entries())
      .map(([name, openFiles]) => ({
        name,
        openFiles: Array.from(openFiles).sort(),
      }))
      .sort((a, b) => b.openFiles.length - a.openFiles.length || a.name.localeCompare(b.name));
  }

  /** Get active coverage as compact text suitable for pre-turn context. */
  getCoverageSummaryText(maxServers: number = 2, maxFiles: number = 2): string | null {
    return formatCoverageSummaryText(this.getActiveCoverageSummary(), maxServers, maxFiles);
  }

  /** Get active coverage filtered to files or directories relevant to the current turn. */
  getRelevantCoverageSummaryText(
    relevantPaths: string[],
    maxServers: number = 2,
    maxFiles: number = 2,
  ): string | null {
    const normalizedPaths = normalizeRelevantPaths(relevantPaths);
    if (normalizedPaths.length === 0) return null;

    const relevantEntries = this.getActiveCoverageSummary()
      .map((entry) => ({
        ...entry,
        openFiles: entry.openFiles.filter((file) => isPathRelevant(file, normalizedPaths)),
      }))
      .filter((entry) => entry.openFiles.length > 0);

    return formatCoverageSummaryText(relevantEntries, maxServers, maxFiles);
  }

  /** Get a diagnostic summary across all servers and files. */
  getDiagnosticSummary(): DiagnosticSummary[] {
    const fileDiags = new Map<string, { errors: number; warnings: number }>();

    for (const client of this.clients.values()) {
      for (const entry of client.getAllDiagnostics()) {
        const file = relativeFilePathFromUri(entry.uri);
        const current = fileDiags.get(file) ?? { errors: 0, warnings: 0 };
        for (const d of entry.diagnostics) {
          if (d.severity === DiagnosticSeverity.Error) current.errors++;
          else if (d.severity === DiagnosticSeverity.Warning) current.warnings++;
        }
        fileDiags.set(file, current);
      }
    }

    return Array.from(fileDiags.entries()).map(([file, counts]) => ({
      file,
      ...counts,
    }));
  }

  /** Get outstanding diagnostics at or above the configured inline threshold. */
  getOutstandingDiagnosticSummary(maxSeverity: number = 1): OutstandingDiagnosticSummaryEntry[] {
    const fileDiags = new Map<string, OutstandingDiagnosticSummaryEntry>();

    for (const client of this.clients.values()) {
      for (const entry of client.getAllDiagnostics()) {
        const file = relativeFilePathFromUri(entry.uri);
        const current = fileDiags.get(file) ?? createOutstandingDiagnosticSummary(file);
        const next = accumulateOutstandingDiagnostics(current, entry.diagnostics, maxSeverity);

        if (next.total > 0) {
          fileDiags.set(file, next);
        }
      }
    }

    return Array.from(fileDiags.values()).sort(
      (a, b) =>
        b.errors - a.errors ||
        b.warnings - a.warnings ||
        b.information - a.information ||
        b.hints - a.hints ||
        a.file.localeCompare(b.file),
    );
  }

  /** Get outstanding diagnostics as compact text suitable for pre-turn context. */
  getOutstandingDiagnosticsSummaryText(
    maxSeverity: number = 1,
    maxFiles: number = 3,
  ): string | null {
    return formatOutstandingDiagnosticsSummaryText(
      this.getOutstandingDiagnosticSummary(maxSeverity),
      maxFiles,
    );
  }

  /** Get outstanding diagnostics filtered to files or directories relevant to the current turn. */
  getRelevantOutstandingDiagnosticsSummaryText(
    relevantPaths: string[],
    maxSeverity: number = 1,
    maxFiles: number = 3,
  ): string | null {
    const normalizedPaths = normalizeRelevantPaths(relevantPaths);
    if (normalizedPaths.length === 0) return null;

    const relevantEntries = this.getOutstandingDiagnosticSummary(maxSeverity).filter((entry) =>
      isPathRelevant(entry.file, normalizedPaths),
    );

    return formatOutstandingDiagnosticsSummaryText(relevantEntries, maxFiles);
  }

  /**
   * Ensure a file is open in its LSP server.
   * Used when the agent needs to read a file for the first time.
   */
  async ensureFileOpen(filePath: string): Promise<LspClient | null> {
    const client = await this.getClientForFile(filePath);
    if (!client) return null;

    const resolvedPath = path.resolve(filePath);
    try {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      client.didOpen(resolvedPath, content);
      return client;
    } catch {
      return null;
    }
  }
}

function relativeFilePathFromUri(uri: string): string {
  return displayRelativeFilePath(uri.replace("file://", ""));
}

function createOutstandingDiagnosticSummary(file: string): OutstandingDiagnosticSummaryEntry {
  return {
    file,
    total: 0,
    errors: 0,
    warnings: 0,
    information: 0,
    hints: 0,
  };
}

function accumulateOutstandingDiagnostics(
  current: OutstandingDiagnosticSummaryEntry,
  diagnostics: Diagnostic[],
  maxSeverity: number,
): OutstandingDiagnosticSummaryEntry {
  const next = { ...current };

  for (const diagnostic of diagnostics) {
    if (!isDiagnosticWithinThreshold(diagnostic, maxSeverity)) continue;

    next.total++;
    incrementOutstandingDiagnosticCount(next, diagnostic.severity);
  }

  return next;
}

function isDiagnosticWithinThreshold(
  diagnostic: Diagnostic,
  maxSeverity: number,
): diagnostic is Diagnostic & { severity: number } {
  return diagnostic.severity !== undefined && diagnostic.severity <= maxSeverity;
}

function incrementOutstandingDiagnosticCount(
  entry: OutstandingDiagnosticSummaryEntry,
  severity: number,
): void {
  if (severity === DiagnosticSeverity.Error) entry.errors++;
  else if (severity === DiagnosticSeverity.Warning) entry.warnings++;
  else if (severity === DiagnosticSeverity.Information) entry.information++;
  else if (severity === DiagnosticSeverity.Hint) entry.hints++;
}
