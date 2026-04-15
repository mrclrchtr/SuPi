import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runtimeGuidanceFingerprint } from "../guidance.ts";
import { LspManager } from "../manager.ts";
import {
  computePendingRuntimeGuidance,
  createRuntimeGuidanceState,
  pruneMissingTrackedPaths,
  registerQualifyingSourceInteraction,
} from "../runtime-state.ts";

type FakeManager = Pick<
  LspManager,
  "isSupportedSourceFile" | "getRelevantOutstandingDiagnosticsSummaryText"
>;

function makeFakeManager(options: {
  supported?: (filePath: string) => boolean;
  diagnostics?: (paths: string[], severity: number) => string | null;
}): FakeManager {
  return {
    isSupportedSourceFile: (filePath: string) =>
      options.supported ? options.supported(filePath) : true,
    getRelevantOutstandingDiagnosticsSummaryText: (paths, severity) =>
      options.diagnostics ? options.diagnostics(paths, severity ?? 1) : null,
  };
}

describe("registerQualifyingSourceInteraction", () => {
  it("ignores unsupported files so runtime LSP context stays dormant", () => {
    const state = createRuntimeGuidanceState();
    const manager = makeFakeManager({ supported: () => false });

    registerQualifyingSourceInteraction(state, manager as LspManager, "read", {
      path: "README.md",
    });

    expect(state.runtimeActive).toBe(false);
    expect(state.pendingActivation).toBe(false);
    expect(state.trackedSourcePaths).toEqual([]);
  });

  it("activates exactly once on the first qualifying interaction and tracks further paths without re-firing activation", () => {
    const state = createRuntimeGuidanceState();
    const manager = makeFakeManager({ supported: () => true });

    registerQualifyingSourceInteraction(state, manager as LspManager, "read", {
      path: "lsp/lsp.ts",
    });

    expect(state.runtimeActive).toBe(true);
    expect(state.pendingActivation).toBe(true);
    expect(state.trackedSourcePaths).toEqual(["lsp/lsp.ts"]);

    // Simulate the activation being consumed by an injection.
    state.pendingActivation = false;

    registerQualifyingSourceInteraction(state, manager as LspManager, "edit", {
      path: "lsp/manager.ts",
    });

    expect(state.pendingActivation).toBe(false);
    expect(state.trackedSourcePaths).toEqual(["lsp/manager.ts", "lsp/lsp.ts"]);
  });

  it("activates and tracks for absolute paths to supported files outside cwd, preserving uniqueness", () => {
    const state = createRuntimeGuidanceState();
    const manager = makeFakeManager({ supported: () => true });
    const firstExternal = "/some/sibling/workspace/src/index.ts";
    const secondExternal = "/another/pkg/src/index.ts";

    registerQualifyingSourceInteraction(state, manager as LspManager, "read", {
      path: firstExternal,
    });
    registerQualifyingSourceInteraction(state, manager as LspManager, "read", {
      path: secondExternal,
    });

    expect(state.runtimeActive).toBe(true);
    // Out-of-tree absolute paths preserve the absolute form so unrelated files
    // sharing a basename don't collapse into one tracked entry.
    expect(state.trackedSourcePaths).toEqual([secondExternal, firstExternal]);
  });

  it("does not activate for files inside node_modules or .pnpm", () => {
    const state = createRuntimeGuidanceState();
    const manager = new LspManager({
      servers: {
        "node-based": {
          command: "node",
          args: [],
          fileTypes: ["ts"],
          rootMarkers: ["package.json"],
        },
      },
    });

    registerQualifyingSourceInteraction(state, manager, "read", {
      path: "node_modules/some-pkg/index.ts",
    });
    registerQualifyingSourceInteraction(state, manager, "edit", {
      path: `${process.cwd()}/node_modules/pkg/lib/index.ts`,
    });
    registerQualifyingSourceInteraction(state, manager, "read", {
      path: "node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.ts",
    });

    expect(state.runtimeActive).toBe(false);
    expect(state.pendingActivation).toBe(false);
    expect(state.trackedSourcePaths).toEqual([]);
  });

  it("activates and tracks for absolute paths inside cwd as their relative form", () => {
    const state = createRuntimeGuidanceState();
    const manager = makeFakeManager({ supported: () => true });
    const absolutePath = `${process.cwd()}/lsp/lsp.ts`;

    registerQualifyingSourceInteraction(state, manager as LspManager, "lsp", {
      file: absolutePath,
      action: "definition",
    });

    expect(state.runtimeActive).toBe(true);
    expect(state.trackedSourcePaths).toEqual(["lsp/lsp.ts"]);
  });
});

// biome-ignore lint/security/noSecrets: describe label, not a credential
describe("pruneMissingTrackedPaths", () => {
  const tmpFiles: string[] = [];
  afterEach(() => {
    for (const f of tmpFiles) fs.rmSync(f, { force: true });
    tmpFiles.length = 0;
  });
  const mkFile = (): string => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lsp-prune-")), "src.ts");
    fs.writeFileSync(f, "export const x = 1;\n");
    tmpFiles.push(f);
    return f;
  };

  it("keeps surviving paths, drops missing ones, and reverts to dormant when empty", () => {
    const state = createRuntimeGuidanceState();
    const manager = makeFakeManager({ supported: () => true });
    const survivor = mkFile();
    const doomed = mkFile();
    registerQualifyingSourceInteraction(state, manager as LspManager, "read", { path: survivor });
    registerQualifyingSourceInteraction(state, manager as LspManager, "read", { path: doomed });

    fs.rmSync(doomed, { force: true });
    pruneMissingTrackedPaths(state);
    expect(state.trackedSourcePaths).toEqual([survivor]);
    expect(state.runtimeActive).toBe(true);

    fs.rmSync(survivor, { force: true });
    pruneMissingTrackedPaths(state);
    expect(state.trackedSourcePaths).toEqual([]);
    expect(state.runtimeActive).toBe(false);
    expect(state.pendingActivation).toBe(false);
  });
});

describe("computePendingRuntimeGuidance", () => {
  it("returns null when runtime context is dormant", () => {
    const state = createRuntimeGuidanceState();
    const manager = makeFakeManager({});

    expect(computePendingRuntimeGuidance(state, manager as LspManager, 1)).toBeNull();
  });

  it("produces an activation hint on the first turn after activation", () => {
    const state = createRuntimeGuidanceState();
    const manager = makeFakeManager({ supported: () => true });
    registerQualifyingSourceInteraction(state, manager as LspManager, "read", {
      path: "lsp/lsp.ts",
    });

    const result = computePendingRuntimeGuidance(state, manager as LspManager, 1);
    expect(result?.content).toContain("LSP ready for semantic navigation");
    expect(result?.input.pendingActivation).toBe(true);
  });

  it("emits a tracking line for tracked files once activation has been consumed", () => {
    const state = createRuntimeGuidanceState();
    const manager = makeFakeManager({ supported: () => true });
    registerQualifyingSourceInteraction(state, manager as LspManager, "read", {
      path: "lsp/lsp.ts",
    });
    state.pendingActivation = false;

    const result = computePendingRuntimeGuidance(state, manager as LspManager, 1);
    expect(result?.content).toContain("LSP tracking source files: lsp/lsp.ts.");
    expect(result?.content).not.toContain("LSP ready");
    expect(result?.input.diagnosticsSummary).toBeNull();
  });

  it("fingerprint after an activation+diagnostics injection matches the fingerprint on the next unchanged turn", () => {
    const state = createRuntimeGuidanceState();
    const diagnostics = "Outstanding LSP diagnostics: lsp/lsp.ts (1 error).";
    const manager = makeFakeManager({
      supported: () => true,
      diagnostics: () => diagnostics,
    });
    registerQualifyingSourceInteraction(state, manager as LspManager, "read", {
      path: "lsp/lsp.ts",
    });

    const firstTurn = computePendingRuntimeGuidance(state, manager as LspManager, 1);
    expect(firstTurn?.content).toContain("LSP ready for semantic navigation");
    expect(firstTurn?.content).toContain(diagnostics);

    const firstFingerprint = runtimeGuidanceFingerprint(
      firstTurn?.input ?? { pendingActivation: false, diagnosticsSummary: null, trackedFiles: [] },
    );

    // Caller clears pendingActivation after injection.
    state.pendingActivation = false;

    const secondTurn = computePendingRuntimeGuidance(state, manager as LspManager, 1);
    const secondFingerprint = runtimeGuidanceFingerprint(
      secondTurn?.input ?? { pendingActivation: false, diagnosticsSummary: null, trackedFiles: [] },
    );

    expect(secondFingerprint).toBe(firstFingerprint);
    // Same fingerprint as what caller stored, so caller should skip re-injection.
  });

  it("detects re-emergence of a previously-injected diagnostics summary after it cleared", () => {
    const state = createRuntimeGuidanceState();
    let currentDiagnostics: string | null = "Outstanding LSP diagnostics: lsp/lsp.ts (1 error).";
    const manager = makeFakeManager({
      supported: () => true,
      diagnostics: () => currentDiagnostics,
    });
    registerQualifyingSourceInteraction(state, manager as LspManager, "read", {
      path: "lsp/lsp.ts",
    });

    // Turn 1: inject diagnostics. Caller stores the fingerprint.
    const first = computePendingRuntimeGuidance(state, manager as LspManager, 1);
    expect(first?.content).toContain("1 error");
    const firstFingerprint = runtimeGuidanceFingerprint(
      first?.input ?? { pendingActivation: false, diagnosticsSummary: null, trackedFiles: [] },
    );
    state.pendingActivation = false;
    state.lastInjectedFingerprint = firstFingerprint;

    // Turn 2: diagnostics cleared. Content still emits the tracking line, but
    // the fingerprint changes (no diagnostics segment).
    currentDiagnostics = null;
    const second = computePendingRuntimeGuidance(state, manager as LspManager, 1);
    expect(second?.content).not.toContain("1 error");
    expect(second?.content).toContain("LSP tracking source files: lsp/lsp.ts.");
    const clearedFingerprint = runtimeGuidanceFingerprint(
      second?.input ?? { pendingActivation: false, diagnosticsSummary: null, trackedFiles: [] },
    );
    expect(clearedFingerprint).not.toBe(firstFingerprint);
    state.lastInjectedFingerprint = clearedFingerprint;

    // Turn 3: same diagnostics reappear — must re-inject because fingerprint differs from cleared state.
    currentDiagnostics = "Outstanding LSP diagnostics: lsp/lsp.ts (1 error).";
    const third = computePendingRuntimeGuidance(state, manager as LspManager, 1);
    expect(third?.content).toContain("1 error");
    const thirdFingerprint = runtimeGuidanceFingerprint(
      third?.input ?? { pendingActivation: false, diagnosticsSummary: null, trackedFiles: [] },
    );
    expect(thirdFingerprint).not.toBe(clearedFingerprint);
    expect(thirdFingerprint).toBe(firstFingerprint);
  });

  it("changes the fingerprint when a new tracked file is added even if diagnostics are unchanged", () => {
    const state = createRuntimeGuidanceState();
    const manager = makeFakeManager({ supported: () => true });
    registerQualifyingSourceInteraction(state, manager as LspManager, "read", {
      path: "lsp/lsp.ts",
    });

    const firstTurn = computePendingRuntimeGuidance(state, manager as LspManager, 1);
    const firstFingerprint = runtimeGuidanceFingerprint(
      firstTurn?.input ?? { pendingActivation: false, diagnosticsSummary: null, trackedFiles: [] },
    );
    state.pendingActivation = false;
    state.lastInjectedFingerprint = firstFingerprint;

    // Touch a second supported file with no diagnostics change.
    registerQualifyingSourceInteraction(state, manager as LspManager, "edit", {
      path: "lsp/manager.ts",
    });

    const secondTurn = computePendingRuntimeGuidance(state, manager as LspManager, 1);
    const secondFingerprint = runtimeGuidanceFingerprint(
      secondTurn?.input ?? { pendingActivation: false, diagnosticsSummary: null, trackedFiles: [] },
    );
    expect(secondFingerprint).not.toBe(firstFingerprint);
    expect(secondTurn?.content).toContain("lsp/manager.ts");
    expect(secondTurn?.content).toContain("lsp/lsp.ts");
  });
});

describe("LspManager source file recognition", () => {
  it("treats configured source files as supported only when the server binary exists on PATH", () => {
    const manager = new LspManager({
      servers: {
        "node-based": {
          command: "node",
          args: [],
          fileTypes: ["ts"],
          rootMarkers: ["package.json"],
        },
      },
    });

    expect(manager.isSupportedSourceFile("lsp/lsp.ts")).toBe(true);
  });

  it("does not treat files as supported when the configured binary is missing", () => {
    const manager = new LspManager({
      servers: {
        missing: {
          command: "definitely-not-on-path-xyz-12345",
          args: [],
          fileTypes: ["ts"],
          rootMarkers: ["package.json"],
        },
      },
    });

    expect(manager.isSupportedSourceFile("lsp/lsp.ts")).toBe(false);
  });

  it("does not treat unsupported extensions as source files", () => {
    const manager = new LspManager({
      servers: {
        "node-based": {
          command: "node",
          args: [],
          fileTypes: ["ts"],
          rootMarkers: ["package.json"],
        },
      },
    });

    expect(manager.isSupportedSourceFile("README.md")).toBe(false);
  });

  it("stops treating files as supported after the server has been marked unavailable for this root", () => {
    const manager = new LspManager({
      servers: {
        "node-based": {
          command: "node",
          args: [],
          fileTypes: ["ts"],
          rootMarkers: ["package.json"],
        },
      },
    });

    expect(manager.isSupportedSourceFile("lsp/lsp.ts")).toBe(true);

    (manager as unknown as { unavailable: Set<string> }).unavailable.add(
      `node-based:${process.cwd()}`,
    );

    expect(manager.isSupportedSourceFile("lsp/lsp.ts")).toBe(false);
  });

  it("keeps files supported when a different root for the same server is unavailable", () => {
    const manager = new LspManager({
      servers: {
        "node-based": {
          command: "node",
          args: [],
          fileTypes: ["ts"],
          rootMarkers: ["package.json"],
        },
      },
    });

    (manager as unknown as { unavailable: Set<string> }).unavailable.add(
      "node-based:/some/other/project",
    );

    expect(manager.isSupportedSourceFile("lsp/lsp.ts")).toBe(true);
  });
});
