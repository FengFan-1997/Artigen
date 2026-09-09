# Artigen canonical skills

`manifest.json` is the single source of truth for runtime Skill metadata. The
compiler emits prompt summaries and bounded references; Markdown files remain
human-readable notes and are not independently authoritative.

The layout follows the progressive-disclosure pattern described by
[Open-Dot-Agents](https://github.com/Open-Dot-Agents/SKILL.md) and
[OpenHands Skills](https://github.com/OpenHands/OpenHands/tree/main/skills):
metadata is loaded first, the full contract is activated only when a trigger
matches, and optional references/scripts stay outside the base prompt.

Prompt evaluation borrows the baseline/candidate/validation split and resume
ideas from [Promptfoo](https://github.com/promptfoo/promptfoo), critique-guided
mutation from [PromptWizard](https://github.com/microsoft/PromptWizard/), and
modular program optimization ideas from
[DSPy](https://github.com/stanfordnlp/dspy). These projects are research
references only; Artigen's production runtime has no dependency on them.

Every Skill is constrained by the server capability intersection. A Skill can
describe a tool but can never grant that tool, widen a budget, or change the
model contract.
