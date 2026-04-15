## 1. Runtime guidance state and activation

- [x] 1.1 Add explicit runtime guidance session state in `lsp/lsp.ts` for tracked source paths, pending guidance, and last-injected fingerprints
- [x] 1.2 Update tool event handling so supported-source `read`, `edit`, `write`, and `lsp` interactions activate or refresh runtime LSP context
- [x] 1.3 Ensure OpenSpec, Markdown, and other unsupported file interactions do not activate runtime LSP context

## 2. Pre-turn guidance gating and message content

- [x] 2.1 Refactor `lsp/guidance.ts` to stop emitting coverage-only pre-turn messages and instead build compact activation and changed-diagnostics summaries
- [x] 2.2 Update `before_agent_start` in `lsp/lsp.ts` to inject runtime guidance only when pending activation or meaningful tracked LSP state changes exist
- [x] 2.3 Deduplicate identical runtime guidance so unchanged diagnostics or tracked context are not re-injected on later prompts

## 3. Verification and docs

- [x] 3.1 Update `lsp/__tests__/guidance.test.ts` to cover dormant-by-default behavior, first source-read activation, unchanged diagnostics suppression, and the absence of coverage-only runtime messages
- [x] 3.2 Add or update any focused tests needed for qualifying tool-event activation and tracked-path behavior
- [x] 3.3 Update repository docs if needed to describe that runtime LSP guidance is now stateful and event-driven while static tool guidance remains available
