import { describe, expect, it, vi } from "vitest";
import {
  getFilePathFromToolEvent,
  persistRecentPaths,
  restoreRecentPaths,
  trackRecentPath,
} from "../recent-paths.ts";

describe("recent LSP paths", () => {
  it("extracts tracked paths from built-in and lsp tool events", () => {
    expect(getFilePathFromToolEvent("read", { path: "lsp/lsp.ts" })).toBe("lsp/lsp.ts");
    expect(getFilePathFromToolEvent("lsp", { file: "lsp/manager.ts" })).toBe("lsp/manager.ts");
    expect(getFilePathFromToolEvent("read", { path: "node_modules/pkg/index.d.ts" })).toBeNull();
    expect(getFilePathFromToolEvent("bash", { command: "pwd" })).toBeNull();
  });

  it("deduplicates and bounds recent paths", () => {
    const paths = trackRecentPath(["README.md", "lsp/lsp.ts"], "README.md", 2);
    expect(paths).toEqual(["README.md", "lsp/lsp.ts"]);
  });

  it("preserves out-of-tree paths as absolute so sibling worktrees stay in the relevance set", () => {
    const paths = trackRecentPath(["README.md"], "/tmp/outside.ts", 2);
    expect(paths).toEqual(["/tmp/outside.ts", "README.md"]);
  });

  it("still drops dependency paths even when they're outside the project root", () => {
    const paths = trackRecentPath(["README.md"], "/tmp/other/node_modules/pkg/index.ts", 2);
    expect(paths).toEqual(["README.md"]);
  });

  it("restores the latest persisted recent paths entry", () => {
    const paths = restoreRecentPaths([
      { type: "custom", customType: "lsp-state", data: { recentPaths: ["README.md"] } },
      { type: "custom", customType: "lsp-state", data: { recentPaths: ["lsp/lsp.ts"] } },
    ]);

    expect(paths).toEqual(["lsp/lsp.ts"]);
  });

  it("persists recent paths only when they change", () => {
    const appendEntry = vi.fn();
    const pi = { appendEntry } as unknown as {
      appendEntry: (customType: string, data: unknown) => void;
    };

    const persisted = persistRecentPaths(pi as never, ["lsp/lsp.ts"], []);
    expect(appendEntry).toHaveBeenCalledWith("lsp-state", { recentPaths: ["lsp/lsp.ts"] });
    expect(persisted).toEqual(["lsp/lsp.ts"]);

    appendEntry.mockClear();
    const unchanged = persistRecentPaths(pi as never, ["lsp/lsp.ts"], ["lsp/lsp.ts"]);
    expect(appendEntry).not.toHaveBeenCalled();
    expect(unchanged).toEqual(["lsp/lsp.ts"]);
  });
});
