import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { OverlayHandle } from "@mariozechner/pi-tui";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import type {
  ActiveCoverageSummaryEntry,
  LspManager,
  OutstandingDiagnosticSummaryEntry,
} from "./manager.ts";

export interface LspInspectorState {
  handle: OverlayHandle | null;
  close: (() => void) | null;
}

export function updateLspUi(
  ctx: ExtensionContext,
  manager: LspManager,
  inlineSeverity: number,
): void {
  const activeCoverage = manager.getActiveCoverageSummary();
  const diagnostics = manager.getOutstandingDiagnosticSummary(inlineSeverity);

  ctx.ui.setStatus("lsp", buildLspStatus(ctx, activeCoverage, diagnostics));
  ctx.ui.setWidget(
    "lsp",
    hasWidgetContent(activeCoverage, diagnostics)
      ? (_tui, theme) => buildLspWidgetComponent(theme, activeCoverage, diagnostics)
      : undefined,
    { placement: "belowEditor" },
  );
}

export function toggleLspStatusOverlay(
  ctx: ExtensionContext,
  manager: LspManager,
  inlineSeverity: number,
  inspector: LspInspectorState,
): void {
  if (inspector.handle && inspector.close) {
    inspector.close();
    return;
  }

  void ctx.ui
    .custom<void>(
      (_tui, theme, _kb, done) => {
        inspector.close = () => done(undefined);
        return createLspInspectorComponent(theme, manager, inlineSeverity);
      },
      {
        overlay: true,
        overlayOptions: {
          anchor: "right-center",
          width: 52,
          maxHeight: "75%",
          margin: { right: 1, top: 1, bottom: 1 },
          nonCapturing: true,
        },
        onHandle: (handle) => {
          inspector.handle = handle;
        },
      },
    )
    .finally(() => {
      inspector.handle = null;
      inspector.close = null;
    });
}

function createLspInspectorComponent(
  theme: ExtensionContext["ui"]["theme"],
  manager: LspManager,
  inlineSeverity: number,
): { render: (width: number) => string[]; invalidate: () => void } {
  return {
    render: (width) => buildLspInspectorContainer(theme, manager, inlineSeverity).render(width),
    invalidate: () => {},
  };
}

function buildLspInspectorContainer(
  theme: ExtensionContext["ui"]["theme"],
  manager: LspManager,
  inlineSeverity: number,
): Container {
  const activeCoverage = manager.getActiveCoverageSummary();
  const diagnostics = manager.getOutstandingDiagnosticSummary(inlineSeverity);
  const container = new Container();

  container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
  container.addChild(
    new Text(
      theme.fg("accent", theme.bold(" λ LSP")) + theme.fg("dim", " inspector  /lsp-status toggles"),
      1,
      0,
    ),
  );

  if (isQuietInspectorState(activeCoverage, diagnostics)) {
    container.addChild(
      new Text(theme.fg("success", "clean") + theme.fg("dim", " • no active servers"), 1, 0),
    );
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    return container;
  }

  container.addChild(new Text(buildOverlaySummaryLine(theme, activeCoverage, diagnostics), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(
    buildOverlaySection(theme, "Coverage", buildOverlayCoverageLines(theme, activeCoverage)),
  );
  container.addChild(new Spacer(1));
  container.addChild(
    buildOverlaySection(
      theme,
      diagnostics.length > 0 ? "Problems" : "Diagnostics",
      buildOverlayDiagnosticLines(theme, diagnostics),
    ),
  );
  container.addChild(new Spacer(1));
  container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

  return container;
}

function isQuietInspectorState(
  activeCoverage: ActiveCoverageSummaryEntry[],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): boolean {
  return activeCoverage.length === 0 && diagnostics.length === 0;
}

function buildLspStatus(
  ctx: ExtensionContext,
  activeCoverage: ActiveCoverageSummaryEntry[],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): string | undefined {
  const activeServers = activeCoverage.length;
  const openFiles = activeCoverage.reduce((sum, entry) => sum + entry.openFiles.length, 0);
  const errors = diagnostics.reduce((sum, entry) => sum + entry.errors, 0);
  const warnings = diagnostics.reduce((sum, entry) => sum + entry.warnings, 0);

  if (activeServers === 0 && openFiles === 0 && errors === 0 && warnings === 0) {
    return undefined;
  }

  const { theme } = ctx.ui;
  const parts = [theme.fg("accent", "λ lsp")];
  if (activeServers > 0) parts.push(theme.fg("dim", pluralize(activeServers, "server")));
  if (openFiles > 0) parts.push(theme.fg("dim", pluralize(openFiles, "open file")));
  if (errors > 0) parts.push(theme.fg("error", pluralize(errors, "error")));
  if (warnings > 0) parts.push(theme.fg("warning", pluralize(warnings, "warning")));
  return parts.join(theme.fg("dim", " • "));
}

function hasWidgetContent(
  _activeCoverage: ActiveCoverageSummaryEntry[],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): boolean {
  return diagnostics.length > 0;
}

function buildLspWidgetComponent(
  theme: ExtensionContext["ui"]["theme"],
  _activeCoverage: ActiveCoverageSummaryEntry[],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): Container {
  const container = new Container();

  for (const line of buildWidgetDiagnosticLines(theme, diagnostics)) {
    container.addChild(new Text(line, 0, 0));
  }

  return container;
}

function buildWidgetDiagnosticLines(
  theme: ExtensionContext["ui"]["theme"],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): string[] {
  if (diagnostics.length === 1) {
    const [entry] = diagnostics;
    if (!entry) return [];
    return [
      `${theme.fg("error", "●")} ${entry.file} ${theme.fg("dim", `— ${formatDiagnosticCounts(entry)}`)}`,
    ];
  }

  const totalErrors = diagnostics.reduce((sum, entry) => sum + entry.errors, 0);
  const totalWarnings = diagnostics.reduce((sum, entry) => sum + entry.warnings, 0);
  const counts: string[] = [];
  if (totalErrors > 0) counts.push(theme.fg("error", pluralize(totalErrors, "error")));
  if (totalWarnings > 0) counts.push(theme.fg("warning", pluralize(totalWarnings, "warning")));

  const visibleFiles = diagnostics.slice(0, 2).map((entry) => entry.file);
  const remaining = diagnostics.length - visibleFiles.length;
  const suffix = remaining > 0 ? `${theme.fg("dim", ` +${remaining} more`)}` : "";

  return [
    `${theme.fg("accent", theme.bold("λ LSP diagnostics"))} ${theme.fg("dim", `— ${pluralize(diagnostics.length, "file")}`)} ${counts.join(theme.fg("dim", " • "))}`,
    `${theme.fg("error", "↳")} ${visibleFiles.join(", ")}${suffix}`,
  ];
}

function buildOverlaySummaryLine(
  theme: ExtensionContext["ui"]["theme"],
  activeCoverage: ActiveCoverageSummaryEntry[],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): string {
  const activeServers = activeCoverage.length;
  const openFiles = activeCoverage.reduce((sum, entry) => sum + entry.openFiles.length, 0);
  const errors = diagnostics.reduce((sum, entry) => sum + entry.errors, 0);
  const warnings = diagnostics.reduce((sum, entry) => sum + entry.warnings, 0);

  const parts = [
    theme.fg("dim", `${pluralize(activeServers, "server")} • ${pluralize(openFiles, "open file")}`),
  ];
  if (errors > 0) {
    parts.push(theme.fg("error", pluralize(errors, "error")));
  } else if (warnings > 0) {
    parts.push(theme.fg("warning", pluralize(warnings, "warning")));
  } else {
    parts.push(theme.fg("success", "clean"));
  }

  return parts.join(theme.fg("dim", "   "));
}

function buildOverlaySection(
  theme: ExtensionContext["ui"]["theme"],
  title: string,
  lines: string[],
): Container {
  const container = new Container();
  container.addChild(new Text(theme.fg("accent", theme.bold(` ${title}`)), 1, 0));
  for (const line of lines) {
    container.addChild(new Text(line, 2, 0));
  }
  return container;
}

function buildOverlayCoverageLines(
  theme: ExtensionContext["ui"]["theme"],
  activeCoverage: ActiveCoverageSummaryEntry[],
): string[] {
  if (activeCoverage.length === 0) {
    return [theme.fg("dim", "no active LSP servers")];
  }

  return activeCoverage.flatMap((entry) => {
    const visibleFiles = entry.openFiles.slice(0, 2);
    const remainingFiles = entry.openFiles.length - visibleFiles.length;
    const fileLine = visibleFiles.length > 0 ? visibleFiles.join(", ") : "none";
    const suffix = remainingFiles > 0 ? theme.fg("dim", ` +${remainingFiles} more`) : "";

    return [
      `${theme.fg("accent", "◆")} ${entry.name} ${theme.fg("dim", `— ${pluralize(entry.openFiles.length, "file")}`)}`,
      `${theme.fg("dim", "↳")} ${fileLine}${suffix}`,
    ];
  });
}

function buildOverlayDiagnosticLines(
  theme: ExtensionContext["ui"]["theme"],
  diagnostics: OutstandingDiagnosticSummaryEntry[],
): string[] {
  if (diagnostics.length === 0) {
    return [theme.fg("success", "✓ no outstanding diagnostics")];
  }

  const lines = diagnostics
    .slice(0, 5)
    .map(
      (entry) =>
        `${theme.fg("error", "●")} ${entry.file} ${theme.fg("dim", `— ${formatDiagnosticCounts(entry)}`)}`,
    );

  const remainingDiagnostics = diagnostics.length - Math.min(diagnostics.length, 5);
  if (remainingDiagnostics > 0) {
    lines.push(
      theme.fg(
        "dim",
        `↳ +${remainingDiagnostics} more diagnostic file${remainingDiagnostics === 1 ? "" : "s"}`,
      ),
    );
  }

  return lines;
}

function formatDiagnosticCounts(entry: OutstandingDiagnosticSummaryEntry): string {
  const counts: string[] = [];
  if (entry.errors > 0) counts.push(pluralize(entry.errors, "error"));
  if (entry.warnings > 0) counts.push(pluralize(entry.warnings, "warning"));
  if (entry.information > 0) counts.push(pluralize(entry.information, "info"));
  if (entry.hints > 0) counts.push(pluralize(entry.hints, "hint"));
  return counts.join(", ");
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
