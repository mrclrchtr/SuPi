import type { OutstandingDiagnosticSummaryEntry } from "./manager.ts";
import { displayRelativeFilePath, shouldIgnoreLspPath } from "./summary.ts";
import { type Diagnostic, DiagnosticSeverity } from "./types.ts";

export function collectDiagnosticSummaryCounts(
  fileDiags: Map<string, { errors: number; warnings: number }>,
  entry: { uri: string; diagnostics: Diagnostic[] },
): void {
  const file = relativeFilePathFromUri(entry.uri);
  if (shouldIgnoreLspPath(file)) return;

  const current = fileDiags.get(file) ?? { errors: 0, warnings: 0 };
  for (const diagnostic of entry.diagnostics) {
    if (diagnostic.severity === DiagnosticSeverity.Error) current.errors++;
    else if (diagnostic.severity === DiagnosticSeverity.Warning) current.warnings++;
  }
  fileDiags.set(file, current);
}

export function createOutstandingDiagnosticSummary(
  file: string,
): OutstandingDiagnosticSummaryEntry {
  return {
    file,
    total: 0,
    errors: 0,
    warnings: 0,
    information: 0,
    hints: 0,
  };
}

export function accumulateOutstandingDiagnostics(
  current: OutstandingDiagnosticSummaryEntry,
  diagnostics: Diagnostic[],
  maxSeverity: number,
): OutstandingDiagnosticSummaryEntry {
  const next = { ...current };

  for (const diagnostic of diagnostics) {
    if (!isDiagnosticWithinThreshold(diagnostic, maxSeverity)) continue;

    next.total++;
    incrementOutstandingDiagnosticCount(next, diagnostic.severity);
  }

  return next;
}

export function relativeFilePathFromUri(uri: string): string {
  return displayRelativeFilePath(uri.replace("file://", ""));
}

function isDiagnosticWithinThreshold(
  diagnostic: Diagnostic,
  maxSeverity: number,
): diagnostic is Diagnostic & { severity: number } {
  return diagnostic.severity !== undefined && diagnostic.severity <= maxSeverity;
}

function incrementOutstandingDiagnosticCount(
  entry: OutstandingDiagnosticSummaryEntry,
  severity: number,
): void {
  if (severity === DiagnosticSeverity.Error) entry.errors++;
  else if (severity === DiagnosticSeverity.Warning) entry.warnings++;
  else if (severity === DiagnosticSeverity.Information) entry.information++;
  else if (severity === DiagnosticSeverity.Hint) entry.hints++;
}
