## ADDED Requirements

### Requirement: Default server definitions
The system SHALL ship with pre-configured server definitions for TypeScript, Python, Rust, Go, and C/C++ that include the server command, arguments, file type associations, and root markers.

#### Scenario: TypeScript project detected
- **WHEN** the agent interacts with a `.ts` or `.tsx` file and `typescript-language-server` is on PATH
- **THEN** the system uses the default TypeScript server config: command `typescript-language-server`, args `["--stdio"]`, fileTypes `["ts", "tsx", "js", "jsx"]`, rootMarkers `["tsconfig.json", "package.json"]`

#### Scenario: Rust project detected
- **WHEN** the agent interacts with a `.rs` file and `rust-analyzer` is on PATH
- **THEN** the system uses the default Rust server config: command `rust-analyzer`, fileTypes `["rs"]`, rootMarkers `["Cargo.toml"]`

### Requirement: Per-project configuration override
The system SHALL load `.pi-lsp.json` from the project root (if present) and merge it with default server definitions, with project config taking precedence.

#### Scenario: Project disables a default server
- **WHEN** `.pi-lsp.json` contains `{ "servers": { "typescript-language-server": { "enabled": false } } }`
- **THEN** the TypeScript server is not started even when `.ts` files are encountered

#### Scenario: Project adds a custom server
- **WHEN** `.pi-lsp.json` defines a new server not in defaults (e.g., `elm-language-server`)
- **THEN** the system uses that server definition for the specified file types

#### Scenario: No project config file
- **WHEN** no `.pi-lsp.json` exists in the project root
- **THEN** the system uses only the built-in default server definitions

### Requirement: Language-to-server mapping
The system SHALL map file extensions to server configurations and select the appropriate server for each file.

#### Scenario: Known extension
- **WHEN** a file with extension `.py` is encountered
- **THEN** the system resolves to the `pyright` (or configured Python) server definition

#### Scenario: Multiple servers for same extension
- **WHEN** two servers claim the same file extension (e.g., both `biome` and `typescript-language-server` handle `.ts`)
- **THEN** the system uses the first server in priority order (project config > defaults order)

#### Scenario: Unknown extension
- **WHEN** a file with extension `.xyz` has no server mapping
- **THEN** no server is started and LSP operations return "no server available"

### Requirement: Server command validation
The system SHALL verify that the configured server command exists on PATH before attempting to spawn it.

#### Scenario: Server binary exists
- **WHEN** the configured command `rust-analyzer` is found via PATH lookup
- **THEN** the server is eligible for spawning

#### Scenario: Server binary missing
- **WHEN** the configured command `gopls` is not found on PATH
- **THEN** the system logs a debug message and skips this server; no error is raised

### Requirement: Root marker detection
The system SHALL detect the project root for each server by searching upward from the file's directory for the server's configured root markers.

#### Scenario: Root marker found
- **WHEN** editing `src/lib/utils.ts` and `package.json` exists at `src/../../package.json`
- **THEN** the project root is resolved to the directory containing `package.json`

#### Scenario: No root marker found
- **WHEN** no root marker files are found searching upward to filesystem root
- **THEN** the system falls back to the current working directory as the project root

### Requirement: Environment variable controls
The system SHALL respect `PI_LSP_DISABLED=1` to disable all LSP functionality and `PI_LSP_SERVERS` to restrict which servers are enabled.

#### Scenario: LSP disabled globally
- **WHEN** `PI_LSP_DISABLED=1` is set
- **THEN** no LSP servers are started and the `lsp` tool returns "LSP is disabled"

#### Scenario: Server whitelist
- **WHEN** `PI_LSP_SERVERS=rust-analyzer,pyright` is set
- **THEN** only `rust-analyzer` and `pyright` servers are eligible; all others are skipped
