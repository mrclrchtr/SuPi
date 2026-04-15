---
name: openspec-brainstorm
description: "You MUST use this before creative OpenSpec work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation, then hands off to the best matching OpenSpec skill or command without managing OpenSpec artifacts."
license: MIT
compatibility: Requires pi plus the Fission-AI OpenSpec CLI in the project.
metadata:
  author: mrclrchtr
  inspiredBy: https://github.com/obra/superpowers/tree/main/skills/brainstorming
  adaptedFor: https://github.com/Fission-AI/OpenSpec
---

# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design and get user approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.

OpenSpec addition: do NOT create, edit, sync, archive, or otherwise manage OpenSpec artifacts in this skill. You may inspect existing OpenSpec changes for context, but this skill ends by handing off to the best matching OpenSpec skill/command.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Explore project context** — check files, docs, recent commits, and current OpenSpec change context
2. **Offer visual companion** (if topic will involve visual questions) — this is its own message, not combined with a clarifying question. See the Visual Companion section below.
3. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
4. **Propose 2-3 approaches** — with trade-offs and your recommendation
5. **Present design** — in sections scaled to their complexity, get user approval after each section
6. **Write handoff brief** — summarize the approved direction in the conversation for the next OpenSpec step
7. **Brief self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below)
8. **User reviews written brief** — ask user to review the brainstorm outcome before proceeding
9. **Transition to OpenSpec** — recommend the best matching OpenSpec skill or command

## Process Flow

```dot
digraph brainstorming {
    "Explore project context" [shape=box];
    "Visual questions ahead?" [shape=diamond];
    "Offer Visual Companion\n(own message, no other content)" [shape=box];
    "Ask clarifying questions" [shape=box];
    "Propose 2-3 approaches" [shape=box];
    "Present design sections" [shape=box];
    "User approves design?" [shape=diamond];
    "Write handoff brief" [shape=box];
    "Brief self-review\n(fix inline)" [shape=box];
    "User reviews brief?" [shape=diamond];
    "Recommend OpenSpec next step" [shape=doublecircle];

    "Explore project context" -> "Visual questions ahead?";
    "Visual questions ahead?" -> "Offer Visual Companion\n(own message, no other content)" [label="yes"];
    "Visual questions ahead?" -> "Ask clarifying questions" [label="no"];
    "Offer Visual Companion\n(own message, no other content)" -> "Ask clarifying questions";
    "Ask clarifying questions" -> "Propose 2-3 approaches";
    "Propose 2-3 approaches" -> "Present design sections";
    "Present design sections" -> "User approves design?";
    "User approves design?" -> "Present design sections" [label="no, revise"];
    "User approves design?" -> "Write handoff brief" [label="yes"];
    "Write handoff brief" -> "Brief self-review\n(fix inline)";
    "Brief self-review\n(fix inline)" -> "User reviews brief?";
    "User reviews brief?" -> "Write handoff brief" [label="changes requested"];
    "User reviews brief?" -> "Recommend OpenSpec next step" [label="approved"];
}
```

**The terminal state is recommending the best next OpenSpec step.** Do NOT invoke frontend-design, writing-plans, mcp-builder, or any other implementation skill. Do NOT create or edit OpenSpec artifacts. The ONLY thing you do after brainstorming is hand off to the best matching OpenSpec command or skill.

## The Process

**Understanding the idea:**

- Check out the current project state first (files, docs, recent commits)
- Check current OpenSpec state early:
  ```bash
  openspec list --json
  ```
- If the user mentions a change, or if a clearly relevant change already exists, read its artifacts for context before refining details:
  - `openspec/changes/<name>/proposal.md`
  - `openspec/changes/<name>/design.md`
  - `openspec/changes/<name>/tasks.md`
  - `openspec/changes/<name>/specs/**/spec.md`
- Before asking detailed questions, assess scope: if the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), flag this immediately. Don't spend questions refining details of a project that needs to be decomposed first.
- If the project is too large for a single spec or change, help the user decompose into sub-projects: what are the independent pieces, how do they relate, what order should they be built? Then brainstorm the first sub-project through the normal design flow. Each sub-project should get its own OpenSpec change / spec → plan → implementation cycle.
- For appropriately-scoped projects, ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria

**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why

**Presenting the design:**

- Once you believe you understand what you're building, present the design
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently
- For each unit, you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier for you to work with - you reason better about code you can hold in context at once, and your edits are more reliable when files are focused. When a file grows large, that's often a signal that it's doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work (e.g., a file that's grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design - the way a good developer improves code they're working in.
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.

**Working with existing OpenSpec changes:**

- Use existing OpenSpec changes to understand context and avoid duplicate work.
- If an existing change already covers the problem, steer toward continuing it instead of creating a duplicate.
- Treat OpenSpec artifacts as context, not as something to manage here.
- Do NOT draft or edit `proposal.md`, `design.md`, `tasks.md`, or `spec.md` in this skill.

## After the Design

**Handoff Brief:**

- Write the validated brainstorming outcome in the conversation, not into OpenSpec artifacts
- Use a compact structure like:

  ```md
  ## Brainstorming Outcome

  **Problem**: ...
  **Recommended approach**: ...
  **Why**: ...
  **Constraints / non-goals**: ...
  **Open questions**: ...
  **Relevant existing change**: ... / none
  **Suggested change name**: ... / n/a
  ```
- Do NOT write `proposal.md`, `design.md`, `tasks.md`, or `spec.md` in this skill
- Do NOT commit anything as part of this skill

**Brief Self-Review:**
After writing the brainstorm outcome, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the recommended approach match the design discussion?
3. **Scope check:** Is this focused enough for a single OpenSpec change, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review — just fix and move on.

**User Review Gate:**
After the brief review loop passes, ask the user to review the written brainstorming outcome before proceeding:

> "Brainstorming outcome captured above. Please review it and let me know if you want to make any changes before we move to the next OpenSpec step."

Wait for the user's response. If they request changes, make them and re-run the brief review loop. Only proceed once the user approves.

**Transition to OpenSpec:**

- Recommend the single best next OpenSpec command or skill
- Prefer the short command form when available:
  - `/opsx-explore`
  - `/opsx-new <name>`
  - `/opsx-propose <name>`
  - `/opsx-continue <name>`
  - `/opsx-apply <name>`
- If the short command is not available, give the equivalent skill form:
  - `/skill:openspec-explore`
  - `/skill:openspec-new-change <name>`
  - `/skill:openspec-propose <name>`
  - `/skill:openspec-continue-change <name>`
  - `/skill:openspec-apply-change <name>`
- Do NOT invoke the next skill yourself. Hand off by recommendation only.

**Recommendation guide:**

- If the user is still uncertain and wants to keep thinking: recommend `openspec-explore`
- If no relevant change exists and the user wants a deliberate step-by-step workflow: recommend `openspec-new-change`
- If no relevant change exists and the user wants speed: recommend `openspec-propose`
- If a relevant change already exists and the next step is the next artifact: recommend `openspec-continue-change`
- If a relevant change already exists and is implementation-ready: recommend `openspec-apply-change`

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design, get approval before moving on
- **Be flexible** - Go back and clarify when something doesn't make sense
- **OpenSpec is context here** - Read it when helpful, don't manage it here

## Visual Companion

A browser-based companion for showing mockups, diagrams, and visual options during brainstorming. Available as a tool — not a mode. Accepting the companion means it's available for questions that benefit from visual treatment; it does NOT mean every question goes through the browser.

**Offering the companion:** When you anticipate that upcoming questions will involve visual content (mockups, layouts, diagrams), offer it once for consent:
> "Some of what we're working on might be easier to explain if I can show it to you in a web browser. I can put together mockups, diagrams, comparisons, and other visuals as we go. This feature is still new and can be token-intensive. Want to try it? (Requires opening a local URL)"

**This offer MUST be its own message.** Do not combine it with clarifying questions, context summaries, or any other content. The message should contain ONLY the offer above and nothing else. Wait for the user's response before continuing. If they decline, proceed with text-only brainstorming.

**Per-question decision:** Even after the user accepts, decide FOR EACH QUESTION whether to use the browser or the terminal. The test: **would the user understand this better by seeing it than reading it?**

- **Use the browser** for content that IS visual — mockups, wireframes, layout comparisons, architecture diagrams, side-by-side visual designs
- **Use the terminal** for content that is text — requirements questions, conceptual choices, tradeoff lists, A/B/C/D text options, scope decisions

A question about a UI topic is not automatically a visual question. "What does personality mean in this context?" is a conceptual question — use the terminal. "Which wizard layout works better?" is a visual question — use the browser.

If they agree to the companion, read the detailed guide before proceeding:
`visual-companion.md`
