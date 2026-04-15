const SEMANTIC_PROMPT_PATTERNS = [
  /\bdefinition\b/i,
  /\bfind(?: all)? references?\b/i,
  /\breferences?\b/i,
  /\busages?\b/i,
  /\bsymbols?\b/i,
  /\bhover\b/i,
  /\brename\b/i,
  /\bcode actions?\b/i,
  /\bdiagnostics?\b/i,
  /\btype errors?\b/i,
  /\bwarning\b/i,
];

const TEXT_SEARCH_COMMAND_PATTERNS = [
  /\brg\b/,
  /\bripgrep\b/,
  /\bgrep\b/,
  /\bgit\s+grep\b/,
  /\back\b/,
  /\bag\b/,
];

/**
 * Returns a redirect message when the agent is about to run a text-search
 * command (rg/grep/etc.) for a clearly semantic question (definitions,
 * references, symbols, diagnostics…) over files that already have active LSP
 * coverage. In that combination the lsp tool is strictly more accurate, so we
 * block the bash call and steer the agent to lsp. Returns null otherwise — we
 * don't interfere with plain-text searches or with searches that fall outside
 * the active LSP coverage.
 */
export function shouldBlockSemanticBashSearch(
  command: string,
  prompt: string,
  relevantPaths: string[],
  hasRelevantCoverage: boolean,
): string | null {
  if (!hasRelevantCoverage) return null;
  if (!isSemanticPrompt(prompt) || !isTextSearchCommand(command)) return null;

  const visiblePaths = relevantPaths.slice(0, 2).join(", ");
  const targetText = visiblePaths ? ` in ${visiblePaths}` : " in files with active LSP coverage";

  return [
    "Use the lsp tool instead of bash text search for semantic queries.",
    `Active LSP coverage is available${targetText}.`,
    "Prefer lsp for definitions, references, symbols, hover, rename planning, code actions, and diagnostics.",
  ].join(" ");
}

export function isSemanticPrompt(prompt: string): boolean {
  return SEMANTIC_PROMPT_PATTERNS.some((pattern) => pattern.test(prompt));
}

export function isTextSearchCommand(command: string): boolean {
  return TEXT_SEARCH_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}
