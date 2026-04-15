// Runtime LSP guidance state — tracks qualifying source interactions and
// computes stateful pre-turn guidance so runtime guidance stays dormant
// until the session actually touches supported source files.

import { existsSync } from "node:fs";
import * as path from "node:path";
import {
  buildRuntimeLspGuidance,
  computeTrackedDiagnosticsSummary,
  type RuntimeGuidanceInput,
} from "./guidance.ts";
import type { LspManager } from "./manager.ts";
import { getRawFilePathFromToolEvent } from "./recent-paths.ts";
import { displayRelativeFilePath } from "./summary.ts";

export const MAX_TRACKED_SOURCE_PATHS = 8;

export interface LspRuntimeGuidanceState {
  runtimeActive: boolean;
  trackedSourcePaths: string[];
  pendingActivation: boolean;
  lastInjectedFingerprint: string | null;
}

export function createRuntimeGuidanceState(): LspRuntimeGuidanceState {
  return {
    runtimeActive: false,
    trackedSourcePaths: [],
    pendingActivation: false,
    lastInjectedFingerprint: null,
  };
}

export function resetRuntimeGuidanceState(state: LspRuntimeGuidanceState): void {
  state.runtimeActive = false;
  state.trackedSourcePaths = [];
  state.pendingActivation = false;
  state.lastInjectedFingerprint = null;
}

export function registerQualifyingSourceInteraction(
  state: LspRuntimeGuidanceState,
  manager: LspManager,
  toolName: string,
  input: Record<string, unknown>,
): void {
  const rawPath = getRawFilePathFromToolEvent(toolName, input);
  if (!rawPath) return;
  if (!manager.isSupportedSourceFile(rawPath)) return;

  // displayRelativeFilePath is the same form diagnostics get keyed under, so
  // the tracked-files list lines up with diagnostic relevance matching for
  // both in-tree files (relative form) and out-of-tree absolute paths.
  const trackedPath = displayRelativeFilePath(rawPath);

  // pendingActivation is a one-shot signal: set only on the first qualifying
  // interaction so the next turn can inject the "LSP ready" hint exactly once.
  // Subsequent interactions keep tracking files but must not re-arm activation
  // — the caller clears the flag after injecting.
  const wasDormant = !state.runtimeActive;
  state.runtimeActive = true;

  if (wasDormant) {
    state.pendingActivation = true;
  }

  state.trackedSourcePaths = [
    trackedPath,
    ...state.trackedSourcePaths.filter((entry) => entry !== trackedPath),
  ].slice(0, MAX_TRACKED_SOURCE_PATHS);
}

/**
 * Drop tracked source paths whose underlying file is gone (deleted/renamed).
 * Without this, `pruneMissingFiles()` cleans the live LSP clients but the
 * runtime guidance would keep advertising the stale path on subsequent turns,
 * and the session couldn't return to a dormant state until other interactions
 * evicted the entry. Tracked paths are in `displayRelativeFilePath` form so
 * `path.resolve` transparently handles both in-tree relative and out-of-tree
 * absolute entries.
 */
export function pruneMissingTrackedPaths(state: LspRuntimeGuidanceState): void {
  if (state.trackedSourcePaths.length === 0) return;
  const surviving = state.trackedSourcePaths.filter((entry) => existsSync(path.resolve(entry)));
  if (surviving.length === state.trackedSourcePaths.length) return;
  state.trackedSourcePaths = surviving;
  if (surviving.length === 0) {
    state.runtimeActive = false;
    state.pendingActivation = false;
  }
}

export function computePendingRuntimeGuidance(
  state: LspRuntimeGuidanceState,
  manager: LspManager,
  inlineSeverity: number,
): { input: RuntimeGuidanceInput; content: string | null } | null {
  if (!state.runtimeActive) return null;

  const diagnosticsSummary = computeTrackedDiagnosticsSummary(
    manager,
    inlineSeverity,
    state.trackedSourcePaths,
  );

  const input: RuntimeGuidanceInput = {
    pendingActivation: state.pendingActivation,
    diagnosticsSummary,
    trackedFiles: state.trackedSourcePaths,
  };

  return { input, content: buildRuntimeLspGuidance(input) };
}
