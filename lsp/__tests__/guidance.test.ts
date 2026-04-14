import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPreTurnLspContext,
  extractPromptPathHints,
  lspPromptGuidelines,
  lspPromptSnippet,
} from "../lsp.ts";
import { LspManager } from "../manager.ts";
import { DiagnosticSeverity } from "../types.ts";

describe("LSP prompt guidance", () => {
  it("exports a semantic-first prompt snippet and fallback guidance", () => {
    expect(lspPromptSnippet).toContain("semantic code intelligence");
    expect(lspPromptGuidelines.join(" ")).toContain("Prefer the lsp tool");
    expect(lspPromptGuidelines.join(" ")).toContain("Fall back to bash/read");
  });

  it("prefers diagnostics-only pre-turn context when relevant diagnostics exist", () => {
    const context = buildPreTurnLspContext(
      {
        getCoverageSummaryText: () =>
          "Active LSP coverage: typescript-language-server (2 open files: lsp/lsp.ts, lsp/manager.ts).",
        getRelevantCoverageSummaryText: () =>
          "Active LSP coverage: typescript-language-server (1 open file: lsp/manager.ts).",
        getOutstandingDiagnosticsSummaryText: () =>
          "Outstanding LSP diagnostics: lsp/manager.ts (1 error).",
        getRelevantOutstandingDiagnosticsSummaryText: () =>
          "Outstanding LSP diagnostics: lsp/manager.ts (1 error).",
      },
      1,
      ["lsp/manager.ts"],
    );

    expect(context).toContain("LSP guidance:");
    expect(context).toContain("Outstanding LSP diagnostics: lsp/manager.ts (1 error).");
    expect(context).not.toContain("Active LSP coverage");
    expect(context).not.toContain("Prefer lsp for definitions");
  });

  it("falls back to active coverage when there are no relevant diagnostics", () => {
    const context = buildPreTurnLspContext(
      {
        getCoverageSummaryText: () =>
          "Active LSP coverage: typescript-language-server (2 open files: lsp/lsp.ts, lsp/manager.ts).",
        getRelevantCoverageSummaryText: () =>
          "Active LSP coverage: typescript-language-server (1 open file: lsp/manager.ts).",
        getOutstandingDiagnosticsSummaryText: () => null,
        getRelevantOutstandingDiagnosticsSummaryText: () => null,
      },
      1,
      ["lsp/manager.ts"],
    );

    expect(context).toContain("Active LSP coverage");
    expect(context).toContain("Prefer lsp for definitions");
  });

  it("omits pre-turn context when there is nothing useful to report", () => {
    const context = buildPreTurnLspContext(
      {
        getCoverageSummaryText: () => null,
        getRelevantCoverageSummaryText: () => null,
        getOutstandingDiagnosticsSummaryText: () => null,
        getRelevantOutstandingDiagnosticsSummaryText: () => null,
      },
      1,
    );

    expect(context).toBeNull();
  });

  it("extracts existing path hints from prompts", () => {
    const hints = extractPromptPathHints(
      "check lsp and lsp/manager.ts plus README.md before editing",
    );

    expect(hints).toContain("lsp");
    expect(hints).toContain("lsp/manager.ts");
    expect(hints).toContain("README.md");
  });
});

describe("LspManager inactive coverage summaries", () => {
  it("omits active coverage summaries before any server is active", () => {
    const manager = new LspManager({
      servers: {
        "typescript-language-server": {
          command: "typescript-language-server",
          args: ["--stdio"],
          fileTypes: ["ts", "tsx", "js", "jsx"],
          rootMarkers: ["package.json"],
        },
        pyright: {
          command: "pyright-langserver",
          args: ["--stdio"],
          fileTypes: ["py", "pyi"],
          rootMarkers: ["pyproject.toml"],
        },
      },
    });

    expect(manager.getCoverageSummaryText()).toBeNull();
  });
});

describe("LspManager relevant coverage summaries", () => {
  it("filters active coverage summaries to relevant directories", () => {
    const manager = new LspManager({
      servers: {
        "typescript-language-server": {
          command: "typescript-language-server",
          args: ["--stdio"],
          fileTypes: ["ts", "tsx", "js", "jsx"],
          rootMarkers: ["package.json"],
        },
      },
    });

    const clients = (
      manager as unknown as {
        clients: Map<
          string,
          {
            name: string;
            status: "running" | "error";
            root: string;
            openFiles: string[];
            getAllDiagnostics(): Array<{ uri: string; diagnostics: unknown[] }>;
          }
        >;
      }
    ).clients;

    clients.set("typescript-language-server:/tmp/project", {
      name: "typescript-language-server",
      status: "running",
      root: "/tmp/project",
      openFiles: [path.join(process.cwd(), "lsp/lsp.ts"), path.join(process.cwd(), "README.md")],
      getAllDiagnostics: () => [],
    });

    const summary = manager.getRelevantCoverageSummaryText(["lsp"]);
    expect(summary).toContain("lsp/lsp.ts");
    expect(summary).not.toContain("README.md");
  });

  it("filters active coverage summaries to relevant files", () => {
    const manager = new LspManager({
      servers: {
        "typescript-language-server": {
          command: "typescript-language-server",
          args: ["--stdio"],
          fileTypes: ["ts", "tsx", "js", "jsx"],
          rootMarkers: ["package.json"],
        },
      },
    });

    const clients = (
      manager as unknown as {
        clients: Map<
          string,
          {
            name: string;
            status: "running" | "error";
            root: string;
            openFiles: string[];
            getAllDiagnostics(): Array<{ uri: string; diagnostics: unknown[] }>;
          }
        >;
      }
    ).clients;

    clients.set("typescript-language-server:/tmp/project", {
      name: "typescript-language-server",
      status: "running",
      root: "/tmp/project",
      openFiles: [
        path.join(process.cwd(), "lsp/lsp.ts"),
        path.join(process.cwd(), "lsp/manager.ts"),
      ],
      getAllDiagnostics: () => [],
    });

    const summary = manager.getRelevantCoverageSummaryText(["manager.ts"]);
    expect(summary).toContain("Active LSP coverage");
    expect(summary).toContain("1 open file");
    expect(summary).toContain("lsp/manager.ts");
    expect(summary).not.toContain("lsp/lsp.ts");
  });
});

describe("LspManager active coverage summaries", () => {
  it("includes open files in active coverage summaries", () => {
    const manager = new LspManager({
      servers: {
        "typescript-language-server": {
          command: "typescript-language-server",
          args: ["--stdio"],
          fileTypes: ["ts", "tsx", "js", "jsx"],
          rootMarkers: ["package.json"],
        },
      },
    });

    const clients = (
      manager as unknown as {
        clients: Map<
          string,
          {
            name: string;
            status: "running" | "error";
            root: string;
            openFiles: string[];
            getAllDiagnostics(): Array<{ uri: string; diagnostics: unknown[] }>;
          }
        >;
      }
    ).clients;

    clients.set("typescript-language-server:/tmp/project", {
      name: "typescript-language-server",
      status: "running",
      root: "/tmp/project",
      openFiles: [
        path.join(process.cwd(), "lsp/lsp.ts"),
        path.join(process.cwd(), "lsp/manager.ts"),
      ],
      getAllDiagnostics: () => [],
    });

    const summary = manager.getCoverageSummaryText();
    expect(summary).toContain("Active LSP coverage");
    expect(summary).toContain("2 open files");
    expect(summary).toContain("lsp/lsp.ts");
    expect(summary).toContain("lsp/manager.ts");
    expect(summary).not.toContain(".tsx");
  });
});

describe("LspManager diagnostic summaries", () => {
  it("filters outstanding diagnostics to relevant files", () => {
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
          }
        >;
      }
    ).clients;

    clients.set("fake", {
      getAllDiagnostics: () => [
        {
          uri: `file://${path.join(process.cwd(), "lsp/manager.ts")}`,
          diagnostics: [{ severity: DiagnosticSeverity.Error, message: "type error" }],
        },
        {
          uri: `file://${path.join(process.cwd(), "README.md")}`,
          diagnostics: [{ severity: DiagnosticSeverity.Error, message: "doc error" }],
        },
      ],
    });

    const summary = manager.getRelevantOutstandingDiagnosticsSummaryText(["manager.ts"], 1);
    expect(summary).toContain("lsp/manager.ts");
    expect(summary).not.toContain("README.md");
  });

  it("summarizes outstanding diagnostics at the requested severity threshold", () => {
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
          }
        >;
      }
    ).clients;

    clients.set("fake", {
      getAllDiagnostics: () => [
        {
          uri: `file://${path.join(process.cwd(), "src/broken.ts")}`,
          diagnostics: [
            { severity: DiagnosticSeverity.Error, message: "type error" },
            { severity: DiagnosticSeverity.Warning, message: "warning" },
            { severity: DiagnosticSeverity.Hint, message: "hint" },
          ],
        },
      ],
    });

    const summary = manager.getOutstandingDiagnosticsSummaryText(2);
    expect(summary).toContain("src/broken.ts");
    expect(summary).toContain("1 error");
    expect(summary).toContain("1 warning");
    expect(summary).not.toContain("hint");
  });
});
