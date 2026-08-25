# design-brief@1

Purpose: turn a design request into explicit audience, message, constraints, outputs, and acceptance criteria.

- Triggers: design, brand, visual, 设计, 品牌, 主视觉, 稿
- Required capabilities: none
- Allowed tools: `update_plan`, `delegate_tasks`, `sandbox_shell`, `declare_artifact`, `request_user_approval`
- Plan template: identify explicit requirements → state the smallest necessary assumptions → map requested outputs to acceptance criteria
- Delivery contract: preserve explicit audience, message, content, format, language, brand, and prohibited-element constraints. Never add an unrequested deliverable.
- Validation: `deliverable-presence`, `user-constraint-coverage`
- Retry: repair one concrete missing constraint or failed validator once.
- Stop: requested outputs pass validation, or a missing user decision makes safe progress impossible.

Good: “Primary audience: first-time buyers; must show price and product name; output: one 4:5 image.”

Bad: “The brand probably needs a complete rebrand and a 20-slide strategy deck.”
