import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditTool, createReadTool, createWriteTool } from "@mariozechner/pi-coding-agent";
import { formatDiagnostics } from "./diagnostics.ts";
import type { LspManager } from "./manager.ts";
import { trackRecentPath } from "./recent-paths.ts";

interface LspOverrideState {
  inlineSeverity: number;
  getManager(): LspManager | null;
  getRecentPaths(): string[];
  setRecentPaths(paths: string[]): void;
  onRecentPathsChange?(): void;
}

export function registerLspAwareToolOverrides(pi: ExtensionAPI, state: LspOverrideState): void {
  const cwd = process.cwd();
  const originalRead = createReadTool(cwd);
  const originalWrite = createWriteTool(cwd);
  const originalEdit = createEditTool(cwd);

  pi.registerTool({
    ...originalRead,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      const result = await originalRead.execute(toolCallId, params, signal, onUpdate);
      recordRecentPath(state, params.path);
      await ensureFileOpen(state.getManager(), params.path);
      return result;
    },
  });

  pi.registerTool({
    ...originalWrite,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      const result = await originalWrite.execute(toolCallId, params, signal, onUpdate);

      recordRecentPath(state, params.path);
      return appendInlineDiagnostics(state.getManager(), params.path, state.inlineSeverity, result);
    },
  });

  pi.registerTool({
    ...originalEdit,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      const result = await originalEdit.execute(toolCallId, params, signal, onUpdate);

      recordRecentPath(state, params.path);
      return appendInlineDiagnostics(state.getManager(), params.path, state.inlineSeverity, result);
    },
  });
}

async function appendInlineDiagnostics<T extends { content: unknown[]; details: unknown }>(
  manager: LspManager | null,
  filePath: string,
  inlineSeverity: number,
  result: T,
): Promise<T> {
  if (!manager) return result;

  try {
    const diags = await manager.syncFileAndGetDiagnostics(filePath, inlineSeverity);
    if (diags.length === 0) return result;

    const diagText = formatDiagnostics(filePath, diags);
    const diagnosticContent = {
      type: "text" as const,
      text: `\n\n⚠️ LSP Diagnostics:\n${diagText}`,
    } as T["content"][number];

    return {
      ...result,
      content: [...result.content, diagnosticContent],
    } as T;
  } catch {
    return result;
  }
}

async function ensureFileOpen(manager: LspManager | null, filePath: string): Promise<void> {
  if (!manager) return;

  try {
    await manager.ensureFileOpen(filePath);
  } catch {
    // Never block the agent on LSP errors
  }
}

function recordRecentPath(state: LspOverrideState, filePath: string): void {
  state.setRecentPaths(trackRecentPath(state.getRecentPaths(), filePath));
  state.onRecentPathsChange?.();
}
