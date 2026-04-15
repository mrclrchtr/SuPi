// LSP Manager — server pool with lazy spawning and diagnostic collection.

import * as fs from "node:fs";
import * as path from "node:path";
import { LspClient } from "./client.ts";
import { getServerForFile } from "./config.ts";
import {
  accumulateOutstandingDiagnostics,
  collectDiagnosticSummaryCounts,
  createOutstandingDiagnosticSummary,
  relativeFilePathFromUri,
} from "./diagnostic-summary.ts";
import {
  displayRelativeFilePath,
  formatCoverageSummaryText,
  formatOutstandingDiagnosticsSummaryText,
  isPathRelevant,
  normalizeRelevantPaths,
  shouldIgnoreLspPath,
} from "./summary.ts";
import type { Diagnostic, LspConfig } from "./types.ts";
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
  /** Memoized per-command availability of LSP server binaries on PATH */
  private commandAvailability = new Map<string, boolean>();

  constructor(private readonly config: LspConfig) {}

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Synchronously check whether a file path maps to a configured LSP server
   * whose binary is actually installed and has not already failed to start.
   * Used by tool-event activation so we don't advertise LSP readiness for
   * files whose server cannot run in this environment.
   */
  isSupportedSourceFile(filePath: string): boolean {
    // Dependency directories are intentionally excluded from recent-path
    // tracking and diagnostic summaries (shouldIgnoreLspPath). Keep runtime
    // guidance activation consistent: reading or editing a file under
    // node_modules / .pnpm must not arm LSP guidance for dependency sources.
    if (shouldIgnoreLspPath(filePath)) return false;
    const match = getServerForFile(this.config, filePath);
    if (!match) return false;
    const [serverName, serverConfig] = match;
    // Mirror getClientForFile's root resolution so the unavailable check stays
    // root-specific. A failed startup in one workspace must not suppress
    // activation for unrelated roots served by the same language server.
    const fileDir = path.dirname(path.resolve(filePath));
    const root = findProjectRoot(fileDir, serverConfig.rootMarkers, process.cwd());
    if (this.unavailable.has(`${serverName}:${root}`)) return false;
    return this.isServerCommandAvailable(serverConfig.command);
  }

  private isServerCommandAvailable(command: string): boolean {
    // Only memoize positive lookups. A negative result may become stale if the
    // user installs the binary mid-session (e.g. `mise install`), and
    // getClientForFile calls commandExists directly — caching false here would
    // leave runtime guidance permanently dormant while client spawning can
    // still succeed.
    if (this.commandAvailability.get(command) === true) return true;
    const available = commandExists(command);
    if (available) this.commandAvailability.set(command, true);
    return available;
  }

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
      this.closeFile(resolvedPath);
      return [];
    }

    const diagnostics = await client.syncAndWaitForDiagnostics(resolvedPath, content);
    return diagnostics.filter((d) => d.severity !== undefined && d.severity <= maxSeverity);
  }

  /** Close a file across any active LSP clients and clear its cached diagnostics. */
  closeFile(filePath: string): void {
    const resolvedPath = path.resolve(filePath);
    for (const client of this.clients.values()) {
      client.didClose(resolvedPath);
    }
  }

  /** Remove any missing files from open-document and diagnostic state. */
  pruneMissingFiles(): string[] {
    const removed: string[] = [];
    for (const client of this.clients.values()) {
      const prune = (client as unknown as { pruneMissingFiles?: () => string[] }).pruneMissingFiles;
      if (typeof prune === "function") {
        removed.push(...prune.call(client));
      }
    }
    return removed;
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
    this.pruneMissingFiles();
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
    this.pruneMissingFiles();
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
    this.pruneMissingFiles();
    const activeServers = new Map<string, Set<string>>();

    for (const server of this.getStatus().servers) {
      if (server.status !== "running" || server.openFiles.length === 0) continue;

      const openFiles = activeServers.get(server.name) ?? new Set<string>();
      for (const file of server.openFiles) {
        const relativeFile = displayRelativeFilePath(file);
        if (shouldIgnoreLspPath(relativeFile)) continue;
        openFiles.add(relativeFile);
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
    this.pruneMissingFiles();
    const fileDiags = new Map<string, { errors: number; warnings: number }>();

    for (const client of this.clients.values()) {
      for (const entry of client.getAllDiagnostics()) {
        collectDiagnosticSummaryCounts(fileDiags, entry);
      }
    }

    return Array.from(fileDiags.entries()).map(([file, counts]) => ({ file, ...counts }));
  }

  /** Get outstanding diagnostics at or above the configured inline threshold. */
  getOutstandingDiagnosticSummary(maxSeverity: number = 1): OutstandingDiagnosticSummaryEntry[] {
    this.pruneMissingFiles();
    const fileDiags = new Map<string, OutstandingDiagnosticSummaryEntry>();

    for (const client of this.clients.values()) {
      for (const entry of client.getAllDiagnostics()) {
        const file = relativeFilePathFromUri(entry.uri);
        if (shouldIgnoreLspPath(file)) continue;
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
      this.closeFile(resolvedPath);
      return null;
    }
  }
}
