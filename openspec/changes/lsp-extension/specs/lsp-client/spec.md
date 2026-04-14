## ADDED Requirements

### Requirement: LSP server spawning
The system SHALL spawn an LSP server subprocess via stdio when the agent first interacts with a file whose language has a configured server.

#### Scenario: First file interaction triggers server start
- **WHEN** the agent reads or edits a `.ts` file and no TypeScript LSP server is running
- **THEN** the system spawns `typescript-language-server --stdio`, sends `initialize` with the detected project root, and waits for `initialized` response

#### Scenario: Server already running for language
- **WHEN** the agent interacts with a second `.ts` file and a TypeScript server is already running
- **THEN** the system reuses the existing server instance (no new spawn)

### Requirement: JSON-RPC transport
The system SHALL implement JSON-RPC 2.0 over stdio with Content-Length header framing for all LSP communication.

#### Scenario: Request-response roundtrip
- **WHEN** a request is sent to the server with a numeric `id`
- **THEN** the system correlates the response by `id` and resolves the pending promise

#### Scenario: Server notification handling
- **WHEN** the server sends a notification (no `id` field, e.g., `textDocument/publishDiagnostics`)
- **THEN** the system dispatches it to the registered notification handler without sending a response

#### Scenario: Partial message buffering
- **WHEN** the server sends a message split across multiple chunks
- **THEN** the system buffers until the full Content-Length payload is received before parsing

### Requirement: Document synchronization
The system SHALL keep the LSP server's document state in sync with the agent's file operations using `textDocument/didOpen`, `textDocument/didChange` (full sync), and `textDocument/didClose`.

#### Scenario: File opened for first time
- **WHEN** the agent reads a file that has an active LSP server
- **THEN** the system sends `textDocument/didOpen` with the file URI, language ID, version 1, and full file content

#### Scenario: File content updated
- **WHEN** the agent writes or edits an already-opened file
- **THEN** the system sends `textDocument/didChange` with an incremented version and the full new content

### Requirement: Server shutdown on session end
The system SHALL send `shutdown` then `exit` to all running LSP servers when the pi session ends, and kill any server process that does not exit within 5 seconds.

#### Scenario: Clean shutdown
- **WHEN** the session ends and servers are running
- **THEN** the system sends `shutdown` request to each server, waits for response, sends `exit` notification, and the server process terminates

#### Scenario: Unresponsive server
- **WHEN** a server does not respond to `shutdown` within 5 seconds
- **THEN** the system kills the server process via SIGTERM

### Requirement: Spawn failure resilience
The system SHALL NOT block agent operation if an LSP server fails to start.

#### Scenario: Server binary not found
- **WHEN** the configured server command is not found on PATH
- **THEN** the system logs a warning and marks the server as unavailable for the session; the agent continues without LSP for that language

#### Scenario: Server crashes during initialization
- **WHEN** the server process exits during the initialize handshake
- **THEN** the system logs the error and marks the server as unavailable; no retry is attempted in the current session
