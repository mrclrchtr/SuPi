// LSP Client — wraps a server process + JsonRpcClient.
// Handles initialize handshake, document sync, shutdown, and crash recovery.

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { CLIENT_CAPABILITIES } from "./capabilities.ts";
import { JsonRpcClient } from "./transport.ts";
import type {
  CodeAction,
  CodeActionContext,
  Diagnostic,
  DocumentSymbol,
  Hover,
  InitializeResult,
  Location,
  LocationLink,
  Position,
  PublishDiagnosticsParams,
  Range,
  ServerCapabilities,
  ServerConfig,
  SymbolInformation,
  TextDocumentIdentifier,
  TextDocumentItem,
  VersionedTextDocumentIdentifier,
  WorkspaceEdit,
} from "./types.ts";
import { detectLanguageId, fileToUri, uriToFile } from "./utils.ts";

const SHUTDOWN_TIMEOUT_MS = 5_000;
const DIAGNOSTIC_WAIT_MS = 3_000;

// ── Types ─────────────────────────────────────────────────────────────

export type ClientStatus = "initializing" | "running" | "error" | "shutdown";

export interface DiagnosticEntry {
  uri: string;
  diagnostics: Diagnostic[];
}

// ── LspClient ─────────────────────────────────────────────────────────

export class LspClient {
  readonly name: string;
  readonly root: string;

  private process: ChildProcess | null = null;
  private rpc: JsonRpcClient | null = null;
  private _status: ClientStatus = "initializing";
  private capabilities: ServerCapabilities | null = null;

  /** Open documents: uri → { version, languageId } */
  private openDocs = new Map<string, { version: number; languageId: string }>();
  /** Per-file diagnostics from the server */
  private diagnosticStore = new Map<string, Diagnostic[]>();
  /** Listeners waiting for diagnostics on a specific uri */
  private diagnosticWaiters = new Map<string, Array<() => void>>();

  constructor(
    name: string,
    private readonly config: ServerConfig,
    root: string,
  ) {
    this.name = name;
    this.root = root;
  }

  get status(): ClientStatus {
    return this._status;
  }

  get openFiles(): string[] {
    return Array.from(this.openDocs.keys()).map(uriToFile);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  /** Spawn the server process and perform the initialize handshake. */
  async start(): Promise<void> {
    const cmd = this.config.command;
    const args = this.config.args ?? [];

    try {
      this.process = spawn(cmd, args, {
        cwd: this.root,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });
    } catch (err) {
      this._status = "error";
      throw new Error(`Failed to spawn ${cmd}: ${err}`, { cause: err });
    }

    if (!this.process.stdin || !this.process.stdout) {
      this._status = "error";
      this.process.kill();
      throw new Error(`${cmd}: missing stdin/stdout`);
    }

    this.rpc = new JsonRpcClient(this.process.stdout, this.process.stdin);

    // Handle notifications
    this.rpc.onNotification((method, params) => {
      if (method === "textDocument/publishDiagnostics") {
        this.handlePublishDiagnostics(params as PublishDiagnosticsParams);
      }
    });

    // Handle crashes
    this.process.on("exit", (_code) => {
      if (this._status !== "shutdown") {
        this._status = "error";
      }
      this.rpc?.dispose();
    });

    this.process.on("error", (_err) => {
      if (this._status !== "shutdown") {
        this._status = "error";
      }
    });

    // Suppress stderr to avoid noise in the agent
    this.process.stderr?.on("data", () => {});

    // Initialize handshake
    try {
      const result = (await this.rpc.sendRequest("initialize", {
        processId: process.pid,
        rootUri: fileToUri(this.root),
        capabilities: CLIENT_CAPABILITIES,
        initializationOptions: this.config.initializationOptions,
      })) as InitializeResult;

      this.capabilities = result.capabilities;
      this.rpc.sendNotification("initialized", {});
      this._status = "running";
    } catch (err) {
      this._status = "error";
      this.process.kill();
      throw new Error(`${this.name}: initialize failed: ${err}`, { cause: err });
    }
  }

  /** Graceful shutdown: send shutdown → exit, kill after timeout. */
  async shutdown(): Promise<void> {
    if (this._status === "shutdown") return;
    this._status = "shutdown";

    if (!this.rpc || !this.process) return;

    try {
      // Send shutdown request with a timeout
      await Promise.race([
        this.rpc.sendRequest("shutdown"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("shutdown timeout")), SHUTDOWN_TIMEOUT_MS),
        ),
      ]);
      this.rpc.sendNotification("exit");
    } catch {
      // Timeout or error — force kill
    }

    this.rpc.dispose();

    // Wait briefly for clean exit, then force kill
    if (this.process.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.process?.kill("SIGTERM");
          resolve();
        }, 1_000);
        this.process?.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    this.openDocs.clear();
    this.diagnosticStore.clear();
  }

  // ── Document Synchronization ────────────────────────────────────────

  /** Open a document (or re-sync if already open). */
  didOpen(filePath: string, content: string): void {
    if (!this.rpc || this._status !== "running") return;

    const uri = fileToUri(filePath);
    const languageId = detectLanguageId(filePath);

    if (this.openDocs.has(uri)) {
      // Already open — send didChange instead
      this.didChange(filePath, content);
      return;
    }

    this.openDocs.set(uri, { version: 1, languageId });
    this.rpc.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      } satisfies TextDocumentItem,
    });
  }

  /** Notify the server of a content change (full document sync). */
  didChange(filePath: string, content: string): void {
    if (!this.rpc || this._status !== "running") return;

    const uri = fileToUri(filePath);
    const doc = this.openDocs.get(uri);

    if (!doc) {
      // Not yet open — do a didOpen
      this.didOpen(filePath, content);
      return;
    }

    doc.version++;
    this.rpc.sendNotification("textDocument/didChange", {
      textDocument: { uri, version: doc.version } satisfies VersionedTextDocumentIdentifier,
      contentChanges: [{ text: content }],
    });
  }

  /** Close a document and clear any cached state for it. */
  didClose(filePath: string): void {
    const uri = fileToUri(filePath);
    const wasOpen = this.openDocs.has(uri);

    this.clearFileState(uri);

    if (!wasOpen || !this.rpc || this._status !== "running") return;

    this.rpc.sendNotification("textDocument/didClose", {
      textDocument: { uri } satisfies TextDocumentIdentifier,
    });
  }

  /** Prune missing files from open documents and cached diagnostics. */
  pruneMissingFiles(): string[] {
    const uris = new Set([...this.openDocs.keys(), ...this.diagnosticStore.keys()]);
    const removedFiles: string[] = [];

    for (const uri of uris) {
      const filePath = uriToFile(uri);
      if (existsSync(filePath)) continue;

      const wasOpen = this.openDocs.has(uri);
      this.clearFileState(uri);
      removedFiles.push(filePath);

      if (wasOpen && this.rpc && this._status === "running") {
        this.rpc.sendNotification("textDocument/didClose", {
          textDocument: { uri } satisfies TextDocumentIdentifier,
        });
      }
    }

    return removedFiles;
  }

  // ── Diagnostics ─────────────────────────────────────────────────────

  /** Get stored diagnostics for a file. */
  getDiagnostics(filePath: string): Diagnostic[] {
    return this.diagnosticStore.get(fileToUri(filePath)) ?? [];
  }

  /** Get all stored diagnostics across all files. */
  getAllDiagnostics(): DiagnosticEntry[] {
    const result: DiagnosticEntry[] = [];
    for (const [uri, diagnostics] of this.diagnosticStore) {
      if (diagnostics.length > 0) {
        result.push({ uri, diagnostics });
      }
    }
    return result;
  }

  /**
   * Sync a file and wait for diagnostics (up to timeout).
   * Returns diagnostics for the file.
   */
  async syncAndWaitForDiagnostics(filePath: string, content: string): Promise<Diagnostic[]> {
    const uri = fileToUri(filePath);

    // Sync the content
    this.didChange(filePath, content);

    // Wait for publishDiagnostics or timeout
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, DIAGNOSTIC_WAIT_MS);
      const waiters = this.diagnosticWaiters.get(uri) ?? [];
      waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
      this.diagnosticWaiters.set(uri, waiters);
    });

    return this.getDiagnostics(filePath);
  }

  // ── LSP Requests ───────────────────────────────────────────────────

  async hover(filePath: string, position: Position): Promise<Hover | null> {
    return this.request("textDocument/hover", {
      textDocument: { uri: fileToUri(filePath) },
      position,
    });
  }

  async definition(
    filePath: string,
    position: Position,
  ): Promise<Location | Location[] | LocationLink[] | null> {
    return this.request("textDocument/definition", {
      textDocument: { uri: fileToUri(filePath) },
      position,
    });
  }

  async references(filePath: string, position: Position): Promise<Location[] | null> {
    return this.request("textDocument/references", {
      textDocument: { uri: fileToUri(filePath) },
      position,
      context: { includeDeclaration: true },
    });
  }

  async documentSymbols(filePath: string): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    return this.request("textDocument/documentSymbol", {
      textDocument: { uri: fileToUri(filePath) },
    });
  }

  async rename(
    filePath: string,
    position: Position,
    newName: string,
  ): Promise<WorkspaceEdit | null> {
    return this.request("textDocument/rename", {
      textDocument: { uri: fileToUri(filePath) },
      position,
      newName,
    });
  }

  async codeActions(
    filePath: string,
    range: Range,
    context: CodeActionContext,
  ): Promise<CodeAction[] | null> {
    return this.request("textDocument/codeAction", {
      textDocument: { uri: fileToUri(filePath) },
      range,
      context,
    });
  }

  // ── Private ─────────────────────────────────────────────────────────

  private async request<T>(method: string, params: unknown): Promise<T | null> {
    if (!this.rpc || this._status !== "running") return null;
    try {
      return (await this.rpc.sendRequest(method, params)) as T;
    } catch {
      return null;
    }
  }

  private handlePublishDiagnostics(params: PublishDiagnosticsParams): void {
    this.diagnosticStore.set(params.uri, params.diagnostics);
    this.releaseDiagnosticWaiters(params.uri);
  }

  private clearFileState(uri: string): void {
    this.openDocs.delete(uri);
    this.diagnosticStore.delete(uri);
    this.releaseDiagnosticWaiters(uri);
  }

  private releaseDiagnosticWaiters(uri: string): void {
    const waiters = this.diagnosticWaiters.get(uri);
    if (!waiters) return;

    this.diagnosticWaiters.delete(uri);
    for (const waiter of waiters) waiter();
  }
}
