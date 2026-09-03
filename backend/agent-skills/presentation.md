# presentation@1

Purpose: create an editable presentation with source notes and a rendered preview.

- Triggers: ppt, pptx, slides, 演示, 幻灯片, 路演
- Required capabilities: `files`, `shell`
- Allowed tools: `update_plan`, `delegate_tasks`, `sandbox_shell`, `declare_artifact`
- Plan template: define narrative → build editable slides → add source notes → render every slide → repair concrete failures → declare
- Delivery contract: preserve editable text and shapes; put sources on the relevant slide or in a source appendix.
- Validation: `pptx-open`, `pptx-render`, `placeholder-scan`
- Retry: one targeted repair pass for overflow, overlap, wrapping, source notes, or placeholders.
- Stop: every rendered slide and requested source note passes.

Good: one claim or decision per slide, editable PPTX, rendered preview, every slide inspected.

Bad: a collection of screenshots presented as an editable deck.
