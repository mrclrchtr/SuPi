// Integration tests for LspManager — tests the server pool against real LSP.
// Requires typescript-language-server + tsserver on PATH.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config.ts";
import { LspManager } from "../manager.ts";
import type { Diagnostic } from "../types.ts";
import { hasCommand, waitFor } from "./integration-utils.ts";

const HAS_TS_LSP = hasCommand("typescript-language-server") && hasCommand("tsserver");

let tmpDir: string;

async function waitForDiagnostics(
  manager: LspManager,
  filePath: string,
  maxSeverity: number,
): Promise<Diagnostic[]> {
  return waitFor(
    () => manager.syncFileAndGetDiagnostics(filePath, maxSeverity),
    (diagnostics) => diagnostics.length > 0,
    { timeoutMs: 1_500, retryDelayMs: 250, label: `diagnostics for ${path.basename(filePath)}` },
  );
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-manager-integration-"));

  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext" },
      include: ["*.ts"],
    }),
  );

  fs.writeFileSync(
    path.join(tmpDir, "valid.ts"),
    // biome-ignore lint/suspicious/noTemplateCurlyInString: TS fixture source code
    "export function greet(name: string): string {\n  return `Hello, ${name}`;\n}\n",
  );

  fs.writeFileSync(path.join(tmpDir, "broken.ts"), 'export const n: number = "string";\n');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe.skipIf(!HAS_TS_LSP)("LspManager integration", () => {
  let manager: LspManager;

  beforeAll(() => {
    const config = loadConfig(tmpDir);
    manager = new LspManager(config);
  });

  afterAll(async () => {
    await manager.shutdownAll();
  });

  it("lazily spawns a client on first file interaction", async () => {
    const validFile = path.join(tmpDir, "valid.ts");
    const client = await manager.ensureFileOpen(validFile);

    expect(client).not.toBeNull();
    expect(client?.name).toBe("typescript-language-server");
    expect(client?.status).toBe("running");
  }, 15_000);

  it("reuses client for same server + root", async () => {
    const file1 = path.join(tmpDir, "valid.ts");
    const file2 = path.join(tmpDir, "broken.ts");

    const client1 = await manager.ensureFileOpen(file1);
    const client2 = await manager.ensureFileOpen(file2);

    expect(client1).toBe(client2);
  }, 10_000);

  it("returns null for unsupported file types", async () => {
    const txtFile = path.join(tmpDir, "readme.txt");
    fs.writeFileSync(txtFile, "just text");
    const client = await manager.ensureFileOpen(txtFile);
    expect(client).toBeNull();
  });

  it("syncs file and returns error diagnostics", async () => {
    const brokenFile = path.join(tmpDir, "broken.ts");
    const diags = await waitForDiagnostics(manager, brokenFile, 1);

    expect(diags.length).toBeGreaterThan(0);
    expect(diags.every((d: Diagnostic) => d.severity === 1)).toBe(true);
  }, 10_000);

  it("returns no error diagnostics for valid file", async () => {
    const validFile = path.join(tmpDir, "valid.ts");
    const diags = await manager.syncFileAndGetDiagnostics(validFile, 1);
    expect(diags).toHaveLength(0);
  }, 10_000);

  it("includes warnings when severity threshold raised", async () => {
    const brokenFile = path.join(tmpDir, "broken.ts");
    const diagsErrors = await waitForDiagnostics(manager, brokenFile, 1);
    const diagsAll = await waitForDiagnostics(manager, brokenFile, 4);
    expect(diagsAll.length).toBeGreaterThanOrEqual(diagsErrors.length);
  }, 10_000);

  it("reports server status", () => {
    const status = manager.getStatus();
    expect(status.servers.length).toBeGreaterThan(0);

    const tsServer = status.servers.find((s) => s.name === "typescript-language-server");
    expect(tsServer).toBeDefined();
    expect(tsServer?.status).toBe("running");
    expect(tsServer?.root).toBe(tmpDir);
  });

  it("reports diagnostic summary", () => {
    const summary = manager.getDiagnosticSummary();
    // Should have at least one file with errors (broken.ts)
    const brokenEntry = summary.find((s) => s.file.includes("broken"));
    expect(brokenEntry).toBeDefined();
    expect(brokenEntry?.errors).toBeGreaterThan(0);
  });

  it("shuts down all servers cleanly", async () => {
    await manager.shutdownAll();
    const status = manager.getStatus();
    expect(status.servers).toHaveLength(0);
  }, 10_000);
});
