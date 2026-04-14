## Context

The repository already ships an `lsp` extension that can answer semantic questions and append diagnostics after `write`/`edit`, but the agent still has to discover that behavior on its own. In practice, the model often reaches for `bash`-based `rg`/`find` workflows because the `lsp` tool is not strongly advertised in the default prompt and no turn-start message explains what semantic coverage is active.

This change is intentionally narrow: improve agent guidance and pre-turn semantic context without forking pi core, changing built-in tools, or adding enforcement logic. The extension should remain lightweight and compatible with the current extension APIs.

## Goals / Non-Goals

**Goals:**
- Make the `lsp` tool more salient in pi's default tool prompt with clear usage guidance.
- Tell the agent, before a prompt runs, when LSP coverage is available and which semantic operations it should prefer.
- Surface outstanding diagnostics before the next prompt so the agent can continue from known problems instead of rediscovering them.
- Keep the behavior advisory, low-noise, and easy to disable or refine later.

**Non-Goals:**
- Hard-block `bash`, `rg`, `grep`, or `find` usage.
- Add core pi changes or fork `pi-mono`.
- Introduce AST, tree-sitter, or non-LSP semantic tools.
- Stream live diagnostic notifications outside the existing turn lifecycle.

## Decisions

### 1. Advertise `lsp` through `promptSnippet` and `promptGuidelines`

**Decision:** Add a short `promptSnippet` and targeted `promptGuidelines` directly on the registered `lsp` tool.

**Rationale:** pi already has a first-class mechanism for making custom tools more visible in the default system prompt. This keeps the preference near the tool definition, avoids custom prompt patching for static guidance, and makes the LSP-first preference active only while the tool is enabled.

**Alternatives considered:**
- **Only update the tool description:** rejected because descriptions are weaker than prompt snippets/guidelines in pi's default prompt construction.
- **Patch the whole system prompt manually:** rejected because it duplicates built-in prompt behavior and is harder to maintain.

### 2. Use `before_agent_start` for turn-start semantic guidance

**Decision:** Inject a short turn-start message in `before_agent_start` summarizing active or available LSP coverage and telling the agent to prefer semantic actions for supported languages.

**Rationale:** `before_agent_start` runs once per user prompt, which is the right cadence for steering without spamming every tool call. It also supports injecting both a custom message and additional system prompt guidance if needed.

**Alternatives considered:**
- **Use `context` for every LLM call:** rejected for v1 because it repeats the same guidance multiple times during tool-heavy turns.
- **Only rely on static promptGuidelines:** rejected because the agent also needs runtime information about current server coverage and diagnostics.

### 3. Summarize outstanding diagnostics as compact pre-turn context

**Decision:** Before each prompt, collect unresolved diagnostics from the manager and inject a bounded summary only when diagnostics exist.

**Rationale:** The extension already stores diagnostics, so the missing piece is surfacing them before the next prompt. A compact summary gives the model continuity without forcing it to call `lsp diagnostics` first.

**Alternatives considered:**
- **Inject full diagnostic text for every file:** rejected because it can bloat context and distract from the user's request.
- **Send follow-up messages asynchronously whenever diagnostics change:** rejected for now because it adds more session orchestration than needed.

### 4. Add helper methods for stable coverage/diagnostic summaries

**Decision:** Extend `LspManager` with small summary helpers instead of assembling strings ad hoc inside `lsp.ts`.

**Rationale:** Coverage and outstanding-diagnostic reporting are extension concepts, not one-off string concatenation. Helper methods keep `lsp.ts` small, make summaries testable, and allow reuse in `/lsp-status` and future strict/prefer modes.

**Alternatives considered:**
- **Build summaries inline in the event handler:** rejected because the logic will likely grow and should stay testable.

## Risks / Trade-offs

- **[Prompt noise]** → Keep pre-turn guidance short, inject it only when LSP is relevant, and cap diagnostic detail to a small summary.
- **[Stale coverage claims]** → Prefer reporting active servers and known configured coverage instead of promising support for every file in the repo.
- **[Stale diagnostics]** → Use the existing diagnostic store and summarize current unresolved entries only; avoid wording that implies the summary is a fresh validation pass.
- **[Over-steering]** → Phrase guidance as preference, not a prohibition, so the agent can still use `bash` when LSP is unavailable or inappropriate.

## Migration Plan

- No user-facing migration is required.
- Existing sessions pick up the new behavior after reload or a new session start.
- Existing environment variables remain unchanged; this change only improves prompt/context behavior.

## Open Questions

- Should pre-turn guidance mention configured coverage that has not yet been activated, or only currently running servers?
- Should outstanding diagnostics include warnings when `PI_LSP_SEVERITY=1`, or remain focused on errors unless the user opts into more verbosity?
