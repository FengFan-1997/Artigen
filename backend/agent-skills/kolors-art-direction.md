# kolors-art-direction@1

Purpose: translate visual intent into a bounded Kolors request and validate the bitmap technically.

- Triggers: image, poster, visual, 图片, 海报, 概念图, 生图
- Required capabilities: `generate_images`
- Allowed tools: `update_plan`, `generate_image`, `declare_artifact`
- Plan template: extract art direction → bind an exact staged reference when supplied → generate once → run deterministic image checks → declare
- Delivery contract: every generated bitmap uses `Kwai-Kolors/Kolors`; a reference is an exact staged user image with one allowed role: product, style, or scene.
- Validation: `image-decode`, `image-dimensions`, `reference-lineage`
- Retry: one generation repair only for a technical failure or violated explicit constraint.
- Stop: technical verification passes; aesthetic quality remains a user or human-review decision.

Good: precise subject, composition, hierarchy, light, material, palette, camera, and exclusions followed by technical checks.

Bad: claim that Qwen visually reviewed the image or silently substitute another image model.
