---
description: Update CLAUDE.md with learnings from this session
---

Review this session for learnings about working in this codebase. Update CLAUDE.md with context that would help future sessions be more effective.

## Step 1: Reflect

What context was missing that would have helped work more effectively?
- Bash commands that were used or discovered
- Code style patterns followed
- Testing approaches that worked
- Environment/configuration quirks
- Warnings or gotchas encountered

## Step 2: Find CLAUDE.md Files

```bash
find . -name "CLAUDE.md" -o -name ".claude.local.md" 2>/dev/null | head -20
```

Decide where each addition belongs:
- `CLAUDE.md` — team-shared, checked into git
- `.claude.local.md` — personal/local only, gitignored

## Step 3: Draft Additions

**Keep it concise** — one line per concept. CLAUDE.md is part of the prompt, so brevity matters.

Format: `<command or pattern>` — `<brief description>`

Avoid:
- Verbose explanations
- Obvious information
- One-off fixes unlikely to recur

## Step 4: Show Proposed Changes

For each addition:

```
### Update: ./CLAUDE.md

**Why:** [one-line reason]

\`\`\`diff
+ [the addition — keep it brief]
\`\`\`
```

## Step 5: Apply with Approval

Ask if changes should be applied. Only edit files that are explicitly approved.
