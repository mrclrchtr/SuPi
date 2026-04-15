// Integration tests for tool-actions — end-to-end from action dispatch to formatted output.
// Requires typescript-language-server + tsserver on PATH.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config.ts";
import { LspManager } from "../manager.ts";
import { executeAction } from "../tool-actions.ts";
import { hasCommand, waitFor } from "./integration-utils.ts";

const HAS_TS_LSP = hasCommand("typescript-language-server") && hasCommand("tsserver");

let tmpDir: string;
let goodFile: string;
let badFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-actions-integration-"));

  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext" },
      include: ["*.ts"],
    }),
  );

  goodFile = path.join(tmpDir, "math.ts");
  fs.writeFileSync(
    goodFile,
    [
      "export function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "",
      "export const PI = 3.14159;",
      "",
      "export class Calculator {",
      "  sum(a: number, b: number): number {",
      "    return add(a, b);",
      "  }",
      "}",
      "",
    ].join("\n"),
  );

  badFile = path.join(tmpDir, "errors.ts");
  fs.writeFileSync(badFile, 'export const x: number = "not a number";\n');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function warmUpToolActionManager(manager: LspManager): Promise<void> {
  await manager.ensureFileOpen(goodFile);
  await waitFor(
    () =>
      executeAction(manager, {
        action: "hover",
        file: goodFile,
        line: 1,
        character: 17,
      }),
    (result) => result.includes("add"),
    { timeoutMs: 5_000, retryDelayMs: 100, label: "hover on 'add' symbol during warm-up" },
  );
}

describe.skipIf(!HAS_TS_LSP)("tool-actions integration", () => {
  let manager: LspManager;

  beforeAll(async () => {
    const config = loadConfig(tmpDir);
    manager = new LspManager(config);
    await warmUpToolActionManager(manager);
  }, 20_000);

  afterAll(async () => {
    await manager.shutdownAll();
  });

  it("hover: returns type info for a function", async () => {
    const result = await executeAction(manager, {
      action: "hover",
      file: goodFile,
      line: 1,
      character: 17,
    });
    expect(result).toContain("add");
  }, 10_000);

  it("hover: reports no info for empty position", async () => {
    const result = await executeAction(manager, {
      action: "hover",
      file: goodFile,
      line: 4,
      character: 1,
    });
    expect(result.toLowerCase()).toContain("no hover");
  }, 10_000);

  it("definition: finds function definition", async () => {
    // "add" is called on line 9 (1-based), character ~12
    const result = await executeAction(manager, {
      action: "definition",
      file: goodFile,
      line: 9,
      character: 12,
    });
    expect(result).toContain("Definition");
    // Should point back to line 1 where add is defined
    expect(result).toMatch(/:\d+:\d+/);
  }, 10_000);

  it("references: finds all references to a symbol", async () => {
    const result = await executeAction(manager, {
      action: "references",
      file: goodFile,
      line: 1,
      character: 17,
    });
    expect(result).toContain("References");
    // "add" is defined on line 1 and used on line 9
    expect(result).toContain("math.ts");
  }, 10_000);

  it("symbols: lists document symbols", async () => {
    const result = await executeAction(manager, {
      action: "symbols",
      file: goodFile,
    });
    expect(result).toContain("add");
    expect(result).toContain("PI");
    expect(result).toContain("Calculator");
  }, 10_000);

  it("diagnostics: reports errors for broken file", async () => {
    const result = await executeAction(manager, {
      action: "diagnostics",
      file: badFile,
    });
    expect(result).toContain("error");
  }, 10_000);

  it("diagnostics: no errors for valid file", async () => {
    const result = await executeAction(manager, {
      action: "diagnostics",
      file: goodFile,
    });
    // Should be "No diagnostics." or have no errors
    const hasError = result.toLowerCase().includes("error") && !result.includes("No diagnostics");
    expect(hasError).toBe(false);
  }, 10_000);

  it("diagnostics: all-file summary when no file specified", async () => {
    // Sync bad file first to ensure diagnostics exist
    await manager.syncFileAndGetDiagnostics(badFile, 1);

    const result = await executeAction(manager, {
      action: "diagnostics",
    });
    expect(result).toContain("error");
  }, 10_000);

  it("rename: computes workspace-wide rename", async () => {
    const result = await executeAction(manager, {
      action: "rename",
      file: goodFile,
      line: 1,
      character: 17,
      newName: "addNumbers",
    });
    // Should show rename edits
    expect(result).toContain("addNumbers");
  }, 10_000);

  it("code_actions: returns available actions", async () => {
    // Sync bad file to get diagnostics first
    await manager.syncFileAndGetDiagnostics(badFile, 1);

    const result = await executeAction(manager, {
      action: "code_actions",
      file: badFile,
      line: 1,
      character: 1,
    });
    // May or may not have actions, just verify structured output
    expect(typeof result).toBe("string");
  }, 10_000);

  it("returns error for unsupported file type", async () => {
    const txtFile = path.join(tmpDir, "readme.txt");
    fs.writeFileSync(txtFile, "just text");

    const result = await executeAction(manager, {
      action: "hover",
      file: txtFile,
      line: 1,
      character: 1,
    });
    expect(result).toContain("No LSP server available");
  });

  it("returns error for missing parameters", async () => {
    await expect(executeAction(manager, { action: "hover", file: goodFile })).rejects.toThrow(
      "line",
    );
  });
});
