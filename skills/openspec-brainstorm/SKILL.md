---
name: openspec-brainstorm
description: Structured brainstorming for OpenSpec changes. Use before implementing a feature, behavior change, or other creative work when you need to clarify intent, constraints, and tradeoffs, then hand off to the best next OpenSpec skill.
license: MIT
compatibility: Requires pi plus the OpenSpec CLI in the project.
metadata:
  author: mrclrchtr
  inspiredBy: https://github.com/obra/superpowers/tree/main/skills/brainstorming
---

# OpenSpec Brainstorming

Turn ideas into an approved direction before implementation starts.

This skill is inspired by the Superpowers `brainstorming` skill, but adapted for pi and OpenSpec. It is more structured than `openspec-explore`: use it when the goal is to converge on a concrete change direction and hand off to the right next OpenSpec skill.

<HARD-GATE>
Do NOT implement application code, scaffold features, start task execution, or create/update OpenSpec artifacts.

This skill stops at an approved brainstorming outcome and a recommendation for the best next OpenSpec skill.
</HARD-GATE>

## Checklist

Complete these in order:

1. **Explore project and OpenSpec context**
2. **Clarify the problem** — ask one question at a time
3. **Check scope** — decompose if the request is too large for one change
4. **Propose 2-3 approaches** — include tradeoffs and a recommendation
5. **Present the design incrementally** — get approval as you go
6. **Summarize the approved direction**
7. **Recommend the best next OpenSpec skill**

## 1) Explore Project and OpenSpec Context

Start by grounding yourself in the actual codebase and current OpenSpec state.

Use repository inspection tools as needed, then check OpenSpec:

```bash
openspec list --json
```

If a relevant change already exists:
- read its artifacts before asking detailed questions
- prefer updating that change over creating a duplicate
- use the existing artifact graph as the source of truth

Typical files to read:
- `openspec/changes/<name>/proposal.md`
- `openspec/changes/<name>/design.md`
- `openspec/changes/<name>/tasks.md`
- `openspec/changes/<name>/specs/**/spec.md`

If no relevant change exists yet, do not rush to create one. First get enough clarity to name and scope the work well.

## 2) Clarify the Problem

Ask **one question per message**.

Prefer short multiple-choice questions when possible, but use open-ended questions when that produces a better answer.

Focus on:
- the user problem or goal
- constraints and non-goals
- who is affected
- success criteria
- how this should fit existing patterns in the codebase

Do not dump a questionnaire. Keep the conversation natural and iterative.

## 3) Check Scope

Before refining details, decide whether the request fits a single OpenSpec change.

If it spans multiple independent subsystems, say so clearly and help the user decompose it into smaller changes. Then brainstorm the first slice.

Use this rule of thumb:
- **one change** if the work can reasonably share one scope, one design, and one implementation task list
- **multiple changes** if the work naturally breaks into independent capabilities or phases

## 4) Propose 2-3 Approaches

Once the shape of the work is clear, present 2-3 viable approaches.

For each approach, cover:
- what it is
- why it might fit
- tradeoffs and risks
- how well it matches the current codebase

Lead with your recommended option and explain why.

## 5) Present the Design Incrementally

After recommending an approach, present the design in sections sized to the complexity of the work.

Possible sections:
- architecture / system boundaries
- user-visible behavior
- interfaces and data flow
- persistence / state changes
- error handling and edge cases
- migration / rollout concerns
- testing and verification

Use ASCII diagrams when they help.

After each substantial section, pause and confirm it still looks right before moving on.

## 6) Summarize the Approved Direction

Once the user approves the direction, stop and summarize the outcome clearly.

Include:
- the problem being solved
- the recommended approach
- key constraints and tradeoffs
- any open questions that remain
- whether this appears to map to a new change or an existing one

Use a short structure like:

```md
## Brainstorming Outcome

**Problem**: ...
**Recommended approach**: ...
**Why this approach**: ...
**Constraints / non-goals**: ...
**Open questions**: ...
```

## 7) Recommend the Best Next OpenSpec Skill

Do **not** create or edit artifacts yourself. Instead, recommend the most appropriate next OpenSpec skill based on the current state.

Use OpenSpec context when needed:

```bash
openspec list --json
openspec status --change "<name>" --json
```

### Recommendation rules

- Recommend `/skill:openspec-new-change` when no relevant change exists yet and the user should start a structured change workflow.
- Recommend `/skill:openspec-propose` when no relevant change exists yet and the user wants the proposal, design, and tasks drafted quickly in one pass.
- Recommend `/skill:openspec-continue-change` when a relevant change already exists and the next step is to create the next artifact.
- Recommend `/skill:openspec-apply-change` when a relevant change exists and is implementation-ready.
- Recommend `/skill:openspec-explore` when the user is still uncertain and wants more open-ended discovery instead of converging.

Be explicit about *why* you recommend that skill.

Example:

> We have a clear direction, but no formal OpenSpec change yet. The best next step is `/skill:openspec-new-change` so we can create the change container and follow the artifact workflow deliberately.

Or:

> The existing change already captures the proposal, and the next missing step is the next artifact in the workflow. The best next step is `/skill:openspec-continue-change`.


## Guardrails

- **Never implement code during brainstorming.**
- **Do not create or edit OpenSpec artifacts in this skill.** End by recommending the right follow-up skill.
- **Do not skip the design step** just because the request looks simple.
- **Do not create duplicate changes** when an existing one should be updated.
- **Do not over-scope the change**; decompose when needed.
- **Do keep the conversation collaborative** — one question at a time, clear tradeoffs, explicit approvals.
