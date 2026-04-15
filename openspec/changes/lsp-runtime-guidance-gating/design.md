## Context

The repository already has an `lsp` extension that provides semantic navigation, diagnostics, and static tool guidance through `promptSnippet` and `promptGuidelines`. A recent change also added `before_agent_start` runtime guidance so the agent sees active LSP coverage and outstanding diagnostics before each prompt. In practice, that runtime path is too eager: it emits generic coverage messages even when the session is working in OpenSpec artifacts or Markdown, leading the agent to parrot capability reminders back to the user.

This change should stay local to the extension. It does not require pi core changes, new tools, or prompt-wide intent classification. The main constraint is that runtime guidance must become more selective without losing useful continuity for active source-code work.

## Goals / Non-Goals

**Goals:**
- Keep static `lsp` tool discoverability in the default prompt.
- Make runtime LSP guidance stateful and tool-driven instead of coverage-driven.
- Only surface runtime guidance after qualifying source-file activity or meaningful LSP state changes.
- Prevent generic runtime messages such as `Active LSP coverage: ...` from appearing on unrelated turns.
- Preserve compact diagnostic continuity when tracked source files gain or change diagnostics.

**Non-Goals:**
- Remove or weaken the static `lsp` `promptSnippet` / `promptGuidelines`.
- Infer user intent primarily from prompt regexes or keyword classifiers.
- Block `bash` or file reads more aggressively than the current guardrails already do.
- Introduce new semantic tools, background daemons, or pi core prompt customizations.

## Decisions

### 1. Keep static tool guidance, gate only runtime guidance
**Decision:** Leave `promptSnippet` and `promptGuidelines` unchanged, but redesign `before_agent_start` guidance to be dormant by default.

**Rationale:** Static tool guidance is cheap, stable, and appropriate as always-on discoverability. The noisy behavior comes from per-turn runtime injection, so the fix should target that path without reducing base visibility of the `lsp` tool.

**Alternatives considered:**
- **Remove static guidance too:** rejected because that would make `lsp` harder to discover for legitimate semantic workflows.
- **Move all guidance into runtime only:** rejected because it would make the extension less helpful on first use and increase reliance on heuristics.

### 2. Activate runtime LSP context from qualifying tool events
**Decision:** Introduce explicit session state in `lsp/lsp.ts` that activates only after qualifying tool interactions on supported source files, such as `read`, `edit`, `write`, or `lsp`.

**Rationale:** Tool events are stronger and less brittle than prompt keyword matching. If the agent actually touched `*.ts`, `*.tsx`, or other supported source files, that is a reliable signal that runtime semantic continuity may help on the next prompt.

**Alternatives considered:**
- **Prompt regex or keyword intent detection:** rejected as too brittle and likely to misfire on OpenSpec/doc turns.
- **Edit-only activation:** rejected because read-only semantic investigation should still be able to activate contextual follow-up guidance.
- **Coverage-only activation:** rejected because it is the root cause of the current noise.

### 3. Re-inject only on meaningful LSP state changes
**Decision:** Add pending-guidance and fingerprint tracking so runtime guidance is injected only after first activation or when tracked LSP state changes materially, especially diagnostics.

**Rationale:** The extension already carries session state. Adding lightweight fingerprints for diagnostics, tracked source paths, and last injected guidance allows the extension to stay silent when nothing changed and speak only when the next prompt truly benefits from continuity.

**Alternatives considered:**
- **Inject on every prompt once active:** rejected because it preserves the current repetition problem.
- **Use a simple cooldown timer only:** rejected because unchanged low-value guidance would still reappear after the timer expires.

### 4. Ban generic coverage announcements from runtime messages
**Decision:** Runtime guidance content should be event-anchored and file-oriented, not server-oriented. Coverage-only messages like `Active LSP coverage: ...` and generic `Prefer lsp ...` reminders should no longer be emitted from `before_agent_start`.

**Rationale:** Those messages restate capability instead of surfacing new information. They are also easy for the model to echo back verbatim. Runtime messages should instead focus on first activation hints, changed diagnostics, or other concrete session deltas.

**Alternatives considered:**
- **Keep the current text but dedupe more aggressively:** rejected because it reduces repetition but not irrelevance.
- **Mention server names only when helpful:** rejected because server-level detail is not what the model needs to choose the next action.

### 5. Fail closed when runtime relevance is uncertain
**Decision:** If the session has no active tracked source context, or if no meaningful LSP state changed since the last injection, `before_agent_start` returns no runtime guidance.

**Rationale:** False negatives are acceptable because static tool guidance still exists. False positives are what produce the user-visible annoyance this change is meant to fix.

**Alternatives considered:**
- **Prefer speaking unless explicitly suppressed:** rejected because it biases toward noise.

## Risks / Trade-offs

- **[Missed first-turn steering]** → If a workflow would have benefited from pre-turn runtime guidance before any qualifying tool use, the extension may stay quiet. Static tool guidance remains available, and current guardrails still steer semantic shell misuse.
- **[State complexity]** → Additional runtime fields and fingerprints increase `lsp/lsp.ts` complexity. Keep state small, session-local, and backed by focused tests.
- **[Read-triggered activation may still be broader than ideal]** → A plain source-file `read` can activate runtime context. Mitigate with one-time activation messaging and no reinjection unless state changes.
- **[Stale tracked files]** → Tracked source paths could linger after the session focus moves. Prune missing paths and tie reinjection to concrete state changes rather than perpetual activity.

## Migration Plan

- No data migration is needed.
- Existing sessions pick up the new behavior after reload or a new session start.
- Update tests to reflect that coverage-only pre-turn guidance is no longer emitted.
- No environment variable changes are required.

## Open Questions

- Should tracked source paths be pruned only when files disappear, or also when the tracked set grows too large for useful summaries?
- Should a first-activation hint mention specific tracked files, or stay generic enough to avoid noisy path lists?
