import { describe, expect, it, vi } from "vitest";
import { shouldBlockSemanticBashSearch } from "../bash-guard.ts";
import { LspManager } from "../manager.ts";

describe("bash semantic guard", () => {
  it("blocks text search commands for semantic prompts with relevant LSP coverage", () => {
    const reason = shouldBlockSemanticBashSearch(
      'rg "MySymbol" lsp',
      "find all references for MySymbol in lsp/manager.ts",
      ["lsp/manager.ts"],
      true,
    );

    expect(reason).toContain("Use the lsp tool instead of bash text search");
    expect(reason).toContain("lsp/manager.ts");
  });

  it("does not block bash when the task is not semantic", () => {
    const reason = shouldBlockSemanticBashSearch(
      'rg "TODO" README.md',
      "find TODO comments in README.md",
      ["README.md"],
      true,
    );

    expect(reason).toBeNull();
  });
});

describe("LspManager stale file pruning", () => {
  it("ignores node_modules diagnostics in summaries", () => {
    const manager = new LspManager({ servers: {} });
    const clients = (
      manager as unknown as {
        clients: Map<
          string,
          {
            getAllDiagnostics(): Array<{
              uri: string;
              diagnostics: Array<{ severity?: number; message: string }>;
            }>;
            pruneMissingFiles(): string[];
          }
        >;
      }
    ).clients;

    clients.set("fake", {
      getAllDiagnostics: () => [
        {
          uri: `file://${process.cwd()}/node_modules/pkg/index.d.ts`,
          diagnostics: [{ severity: 1, message: "bad dep types" }],
        },
      ],
      pruneMissingFiles: () => [],
    });

    expect(manager.getOutstandingDiagnosticsSummaryText(1)).toBeNull();
  });

  it("prunes missing open files before coverage summaries", () => {
    const manager = new LspManager({
      servers: {
        "typescript-language-server": {
          command: "typescript-language-server",
          args: ["--stdio"],
          fileTypes: ["ts"],
          rootMarkers: ["package.json"],
        },
      },
    });

    const fakeClient = {
      name: "typescript-language-server",
      status: "running" as const,
      root: "/tmp/project",
      openFiles: ["/tmp/project/missing.ts"],
      getAllDiagnostics: () => [],
      pruneMissingFiles: vi.fn(() => {
        fakeClient.openFiles = [];
        return ["/tmp/project/missing.ts"];
      }),
      didClose: vi.fn(),
    };

    const clients = (manager as unknown as { clients: Map<string, typeof fakeClient> }).clients;
    clients.set("typescript-language-server:/tmp/project", fakeClient);

    expect(manager.getCoverageSummaryText()).toBeNull();
    expect(fakeClient.pruneMissingFiles).toHaveBeenCalled();
  });

  it("closes files across active clients", () => {
    const manager = new LspManager({ servers: {} });
    const fakeClient = {
      didClose: vi.fn(),
      pruneMissingFiles: () => [],
    };

    const clients = (manager as unknown as { clients: Map<string, typeof fakeClient> }).clients;
    clients.set("fake", fakeClient);

    manager.closeFile("README.md");
    expect(fakeClient.didClose).toHaveBeenCalled();
  });
});
