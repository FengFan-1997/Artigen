---
version: 1
slug: "frontend-src-agentimg-views-designconversation-vue"
primary_target: "frontend/src/agentImg/views/DesignConversation.vue"
related_targets: []
---

# Artigen Create — Digital Prepress Proofing Table

- **Scope:** `/artigen/create` unified creation entry. It shares the same three-lane shell with `/artigen/agent` and `/artigen/agent/runs/:runId`.
- **Mode:** Operate.
- **Audience:** Designers, commerce creators, content makers, and customization providers who know the outcome they need but not Artigen's tool map.
- **Job:** Describe a goal once, answer at most two material questions, then follow execution and collect outputs without leaving the working proof.
- **Primary action:** Send the first request; later actions are scoped clarification, cancellation, authorization, and download.
- **Visual authority:** Concept seed `3c7e566d`, candidate `04` (final-approved). This is a digital prepress proofing table, not the former dark graphite workspace.
- **Direction:** Default cool-white paper, structural ink, cobalt only for selection/focus, and acid lime only for execution/registration. The crosshair registration mark is the signature.
- **Anatomy:** Left project shelf, center working proof, right production console. Use flat adjacent surfaces and rules, not a card wall. Console tabs remain Environment, Plan, Subagents, Computer, Files.
- **Headline:** “你想完成什么？” may be large and editorial, but is a work instruction rather than a marketing Hero.
- **Type floor:** Body 14px, controls 12px, metadata 11px, mobile inputs 16px; mobile risk and consequence copy 14px. Never use 9px text.
- **Memorable moment:** After the first message, the centered brief field docks to the bottom while the request opens into an inline production sequence in the same frame.
- **Attachments:** Files stay local after selection and upload only after a cloud execution path is chosen and continued. Keep this boundary visible beside the composer.
- **Content:** Real messages, executor identity, plan, queue/progress, credits, approvals, images, files, and recovery states. No fabricated proof or SLA.
- **Model truth:** Text, clarification, planning, parent Agent, and subagents use `Qwen/Qwen3-8B`; all image output uses `Kwai-Kolors/Kolors`, with at most one reference image.
- **Responsive:** At 1200px and above show all lanes; 800–1199px uses overlays; below 800px uses full-height drawers without horizontal scrolling. Every collapsed rail retains a named recovery control.
- **Accessibility:** Name every interactive icon and hide decorative icons from assistive technology. Preserve keyboard shortcuts, focus traps/restoration, keyboard resizers, 44×44px mobile targets, live announcements, and user tab/scroll/draft state.
- **Motion:** Use restrained transform, opacity, and color changes. Under `prefers-reduced-motion`, remove movement, loops, and transition duration completely.
- **Themes:** Light is default. Dark and system themes remain complete and semantically identical across focus, selection, execution, warning, error, and success.
- **Anti-patterns:** No dark-first graphite world, acid-lime CTA/focus ring, card wall, glass, permanent heavy shadows, unrecoverable rails, hidden mobile risks, or premature upload.
- **Unresolved decisions:** None.
