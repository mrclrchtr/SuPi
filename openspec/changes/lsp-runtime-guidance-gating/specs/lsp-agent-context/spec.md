## ADDED Requirements

### Requirement: Runtime LSP context SHALL activate from qualifying source interactions
The system SHALL keep runtime LSP guidance dormant until the session performs a qualifying interaction on a supported source file.

#### Scenario: Supported source file is read
- **WHEN** the agent reads a supported source file through a tool such as `read`
- **THEN** the extension marks runtime LSP context as active for follow-up prompts
- **AND** the touched source file becomes part of the tracked source context

#### Scenario: Non-source file is read
- **WHEN** the agent reads OpenSpec artifacts, Markdown files, or other unsupported files
- **THEN** the extension does not activate runtime LSP context from that interaction

#### Scenario: Supported source file is modified semantically
- **WHEN** the agent uses `edit`, `write`, or `lsp` against a supported source file
- **THEN** the extension activates or refreshes runtime LSP context for that tracked file set

## MODIFIED Requirements

### Requirement: Turn-start LSP coverage guidance
Before each user prompt is processed, the system SHALL inject turn-start LSP guidance only when runtime LSP context is active and a meaningful LSP state change has occurred for tracked source files.

#### Scenario: First qualifying source interaction occurred
- **WHEN** runtime LSP context was dormant and the previous turn performed a qualifying interaction on a supported source file
- **THEN** `before_agent_start` injects one compact activation hint for the next prompt
- **AND** the message does not include a generic active-coverage announcement

#### Scenario: No qualifying source interaction occurred
- **WHEN** the extension has active or known LSP coverage but the session has not yet performed a qualifying supported-source interaction
- **THEN** `before_agent_start` does not inject runtime LSP guidance based on coverage alone

#### Scenario: No meaningful LSP state change exists
- **WHEN** runtime LSP context is active but tracked diagnostics, tracked source context, and pending runtime guidance have not changed since the last injection
- **THEN** the system omits turn-start LSP guidance for that prompt

### Requirement: Outstanding diagnostics are surfaced before prompts
Before each user prompt is processed, the system SHALL summarize unresolved tracked LSP diagnostics only when those diagnostics are newly available or have materially changed for the active runtime LSP context.

#### Scenario: Tracked diagnostics changed
- **WHEN** the diagnostic store contains changed unresolved diagnostics for one or more tracked source files at the configured threshold
- **THEN** `before_agent_start` injects a compact summary of those changed diagnostics before the next prompt
- **AND** the summary is visible to the agent before it decides what action to take

#### Scenario: Tracked diagnostics are unchanged
- **WHEN** the diagnostic store still contains unresolved diagnostics but their tracked summary has not changed since the last injected runtime guidance
- **THEN** the system does not re-inject the same diagnostics summary again

#### Scenario: No tracked diagnostics exist
- **WHEN** the diagnostic store is empty for the tracked runtime LSP context or all tracked files currently have no diagnostics at the configured threshold
- **THEN** the system omits the diagnostics summary instead of adding empty boilerplate

### Requirement: Pre-turn semantic context SHALL remain bounded
The system SHALL keep injected runtime LSP context concise, event-anchored, and silent by default so that turn-start guidance does not overwhelm the user prompt.

#### Scenario: Coverage exists without actionable runtime context
- **WHEN** the extension has active LSP coverage but no pending activation hint, changed diagnostics, or other meaningful tracked runtime change
- **THEN** the system injects no runtime LSP message for that prompt

#### Scenario: Runtime guidance is emitted
- **WHEN** the extension injects runtime LSP guidance
- **THEN** the message describes the relevant activation or tracked diagnostic change in a compact form
- **AND** the message does not emit generic text such as `Active LSP coverage: ...` or a repeated tool-usage tutorial

#### Scenario: Many tracked files have diagnostics
- **WHEN** unresolved diagnostics span many tracked files
- **THEN** the injected summary is capped to a compact overview rather than inlining every diagnostic in full
