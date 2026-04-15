import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRuntimeLspGuidance,
  computeTrackedDiagnosticsSummary,
  extractPromptPathHints,
  filterLspGuidanceMessages,
  lspPromptGuidelines,
  lspPromptSnippet,
  runtimeGuidanceFingerprint,
} from "../guidance.ts";
import { LspManager } from "../manager.ts";
import { DiagnosticSeverity } from "../types.ts";

describe("LSP prompt guidance", () => {
  it("exports a semantic-first prompt snippet and fallback guidance", () => {
    expect(lspPromptSnippet).toContain("semantic code intelligence");
    expect(lspPromptGuidelines.join(" ")).toContain("Prefer the lsp tool");
    expect(lspPromptGuidelines.join(" ")).toContain("Fall back to bash/read");
  });

  it("emits a compact activation hint when runtime LSP context first activates", () => {
    const content = buildRuntimeLspGuidance({
      pendingActivation: true,
      diagnosticsSummary: null,
      trackedFiles: ["lsp/lsp.ts", "lsp/manager.ts"],
    });

    expect(content).toContain("LSP guidance:");
    expect(content).toContain("LSP ready for semantic navigation");
    expect(content).toContain("lsp/lsp.ts");
    expect(content).not.toContain("Active LSP coverage");
    expect(content).not.toContain("Prefer lsp for definitions");
  });

  it("emits changed diagnostics summary without restating generic coverage", () => {
    const content = buildRuntimeLspGuidance({
      pendingActivation: false,
      diagnosticsSummary: "Outstanding LSP diagnostics: lsp/manager.ts (1 error).",
      trackedFiles: ["lsp/manager.ts"],
    });

    expect(content).toContain("Outstanding LSP diagnostics: lsp/manager.ts (1 error).");
    expect(content).not.toContain("Active LSP coverage");
  });

  it("emits a tracking line for tracked files when activation has been consumed", () => {
    const content = buildRuntimeLspGuidance({
      pendingActivation: false,
      diagnosticsSummary: null,
      trackedFiles: ["lsp/lsp.ts"],
    });

    expect(content).toContain("LSP guidance:");
    expect(content).toContain("LSP tracking source files: lsp/lsp.ts.");
    expect(content).not.toContain("LSP ready");
  });

  it("returns null when runtime LSP context is dormant (no tracked files)", () => {
    const content = buildRuntimeLspGuidance({
      pendingActivation: false,
      diagnosticsSummary: null,
      trackedFiles: [],
    });

    expect(content).toBeNull();
  });

  it("fingerprint reflects diagnostics and tracked files but not activation", () => {
    const base = {
      pendingActivation: false,
      diagnosticsSummary: "Outstanding LSP diagnostics: lsp/manager.ts (1 error).",
      trackedFiles: ["lsp/manager.ts"],
    };

    expect(runtimeGuidanceFingerprint(base)).toBe(runtimeGuidanceFingerprint(base));
    // Activation is one-shot — excluding it keeps the fingerprint comparable.
    expect(runtimeGuidanceFingerprint(base)).toBe(
      runtimeGuidanceFingerprint({ ...base, pendingActivation: true }),
    );
    // Diagnostics changes register.
    expect(runtimeGuidanceFingerprint(base)).not.toBe(
      runtimeGuidanceFingerprint({
        ...base,
        diagnosticsSummary: "Outstanding LSP diagnostics: lsp/manager.ts (2 errors).",
      }),
    );
    // Tracked-file changes register so multi-file workflows refresh guidance.
    expect(runtimeGuidanceFingerprint(base)).not.toBe(
      runtimeGuidanceFingerprint({ ...base, trackedFiles: ["lsp/manager.ts", "lsp/lsp.ts"] }),
    );
    // Reordering the same tracked-file set must not change the fingerprint —
    // re-touching a tracked file moves it to the front but shouldn't re-inject.
    expect(
      runtimeGuidanceFingerprint({ ...base, trackedFiles: ["lsp/manager.ts", "lsp/lsp.ts"] }),
    ).toBe(runtimeGuidanceFingerprint({ ...base, trackedFiles: ["lsp/lsp.ts", "lsp/manager.ts"] }));
  });

  it("tracked diagnostics summary is null when no paths are tracked", () => {
    const summary = computeTrackedDiagnosticsSummary(
      {
        getRelevantOutstandingDiagnosticsSummaryText: () => {
          throw new Error("should not be called when tracked set is empty");
        },
      },
      1,
      [],
    );

    expect(summary).toBeNull();
  });

  it("tracked diagnostics summary delegates to the manager for tracked paths", () => {
    const summary = computeTrackedDiagnosticsSummary(
      {
        getRelevantOutstandingDiagnosticsSummaryText: (paths, severity) => {
          expect(paths).toEqual(["lsp/manager.ts"]);
          expect(severity).toBe(2);
          return "Outstanding LSP diagnostics: lsp/manager.ts (1 error).";
        },
      },
      2,
      ["lsp/manager.ts"],
    );

    expect(summary).toBe("Outstanding LSP diagnostics: lsp/manager.ts (1 error).");
  });

  it("extracts existing path hints from prompts", () => {
    const hints = extractPromptPathHints(
      "check lsp and lsp/manager.ts plus README.md before editing",
    );

    expect(hints).toContain("lsp");
    expect(hints).toContain("lsp/manager.ts");
    expect(hints).toContain("README.md");
  });

  it("keeps only the active lsp guidance message in context", () => {
    const messages = [
      { customType: "lsp-guidance", details: { guidanceToken: "old" } },
      { customType: "note", details: {} },
      { customType: "lsp-guidance", details: { guidanceToken: "current" } },
    ];

    expect(filterLspGuidanceMessages(messages, "current")).toEqual([
      { customType: "note", details: {} },
      { customType: "lsp-guidance", details: { guidanceToken: "current" } },
    ]);
  });

  it("drops stale lsp guidance entirely when there is no active token", () => {
    const messages = [
      { customType: "lsp-guidance", details: { guidanceToken: "old" } },
      { customType: "note", details: {} },
    ];

    expect(filterLspGuidanceMessages(messages, null)).toEqual([
      { customType: "note", details: {} },
    ]);
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
