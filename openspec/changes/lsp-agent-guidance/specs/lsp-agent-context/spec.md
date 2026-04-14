## ADDED Requirements

### Requirement: Turn-start LSP coverage guidance
Before each user prompt is processed, the system SHALL inject turn-start guidance that tells the agent when LSP coverage is available and that semantic operations should be preferred for covered code.

#### Scenario: Active LSP coverage exists
- **WHEN** the extension has active or known LSP coverage relevant to the current project
- **THEN** `before_agent_start` injects a message or system guidance summarizing that coverage
- **AND** the guidance tells the agent to prefer `lsp` operations for covered languages and files

#### Scenario: No relevant LSP coverage exists
- **WHEN** the extension has no active or known LSP coverage to report
- **THEN** the system does not inject a misleading semantic-first coverage message

### Requirement: Outstanding diagnostics are surfaced before prompts
Before each user prompt is processed, the system SHALL summarize unresolved LSP diagnostics already known to the extension and provide that summary to the agent as context.

#### Scenario: Unresolved diagnostics exist
- **WHEN** the diagnostic store contains outstanding diagnostics for one or more files
- **THEN** `before_agent_start` injects a compact summary listing affected files and diagnostic counts or highlights
- **AND** the summary is visible to the agent before it decides what action to take

#### Scenario: No unresolved diagnostics exist
- **WHEN** the diagnostic store is empty or all tracked files currently have no diagnostics at the configured threshold
- **THEN** the system omits the diagnostics summary instead of adding empty boilerplate

### Requirement: Pre-turn semantic context SHALL remain bounded
The system SHALL keep injected LSP coverage and diagnostic context concise so that turn-start guidance does not overwhelm the user prompt.

#### Scenario: Many files have diagnostics
- **WHEN** unresolved diagnostics span many files
- **THEN** the injected summary is capped to a compact overview rather than inlining every diagnostic in full

#### Scenario: Coverage and diagnostics are both present
- **WHEN** the extension has both active coverage information and outstanding diagnostics
- **THEN** the injected context combines them in a short, readable form that preserves the user prompt as the primary input
