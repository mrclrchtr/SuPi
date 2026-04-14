## ADDED Requirements

### Requirement: Write/edit interception for diagnostic feedback
The system SHALL intercept `write` and `edit` tool calls, sync the resulting file content with the LSP server, and append error-level diagnostics to the tool result.

#### Scenario: Write introduces a type error
- **WHEN** the agent writes a file and the LSP server reports error-level diagnostics after sync
- **THEN** the error diagnostics are appended to the write tool's result text so the agent sees them immediately

#### Scenario: Write with no errors
- **WHEN** the agent writes a file and the LSP server reports no error-level diagnostics
- **THEN** the tool result is not modified

#### Scenario: Write to file with no LSP server
- **WHEN** the agent writes a file that has no active LSP server (unsupported language or server unavailable)
- **THEN** the tool result is not modified and no error occurs

### Requirement: Diagnostic collection from server notifications
The system SHALL collect diagnostics from `textDocument/publishDiagnostics` server notifications and store them per-file, replacing previous diagnostics for that file on each update.

#### Scenario: Server publishes diagnostics
- **WHEN** the LSP server sends a `textDocument/publishDiagnostics` notification with 3 diagnostics
- **THEN** the system stores those 3 diagnostics for the file, replacing any previously stored diagnostics

#### Scenario: Diagnostics cleared by server
- **WHEN** the LSP server sends `textDocument/publishDiagnostics` with an empty diagnostics array
- **THEN** the system clears all stored diagnostics for that file

### Requirement: Severity filtering
The system SHALL only surface error-level diagnostics (severity 1) inline after write/edit by default. Warnings and hints SHALL be available via the `lsp` tool's `diagnostics` action.

#### Scenario: Mix of errors and warnings
- **WHEN** the agent writes a file and the server reports 1 error and 3 warnings
- **THEN** only the 1 error is appended to the tool result inline; all 4 are available via `action: "diagnostics"`

#### Scenario: Custom severity threshold
- **WHEN** `PI_LSP_SEVERITY` is set to `2` (warning level)
- **THEN** both errors and warnings are surfaced inline after write/edit

### Requirement: Diagnostic wait timeout
The system SHALL wait a bounded time for diagnostics after syncing a file, to avoid blocking the agent indefinitely.

#### Scenario: Server responds quickly
- **WHEN** the LSP server publishes diagnostics within 3 seconds of document sync
- **THEN** the diagnostics are collected and surfaced

#### Scenario: Server is slow to respond
- **WHEN** the LSP server does not publish diagnostics within 3 seconds
- **THEN** the system proceeds without diagnostics and does not block the agent
