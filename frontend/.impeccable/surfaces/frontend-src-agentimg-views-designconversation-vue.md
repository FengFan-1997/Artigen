---
version: 1
slug: "frontend-src-agentimg-views-designconversation-vue"
primary_target: "frontend/src/agentImg/views/DesignConversation.vue"
related_targets: []
---

# Artigen Create

- Scope: `/artigen/create` unified creation entry and conversation workspace.
- Mode: Operate.
- Audience: designers, commerce creators, content makers, and customization providers who know the outcome they need but not Artigen's tool map.
- Job: describe a design goal once, answer at most two material questions, then follow execution and collect outputs without leaving the conversation.
- Primary action: send the first design request; subsequent primary actions are scoped clarification, cancellation, authorization, and download.
- Content: real conversation messages, executor identity, plan, queue/progress, credits, approvals, images, files, and precise recovery states. No fabricated proof or SLA.
- Constraints: Qwen3 for all text/planning; Kolors for all image output; 50-credit automatic cap; local-first attachments; 30-day encrypted history; existing advanced workbenches remain.
- Direction: a borderless three-lane professional workspace. Adjacent dark surfaces, stable spacing, and a single acid-green execution signal create hierarchy; decorative borders, model slogans, and repeated runtime copy are absent.
- Progressive disclosure: the default surface shows only goal, status, cost, required action, and final result. Model locks, provider, sandbox, worker, egress, retention, and capability limits remain truthful under an accessible “技术详情” disclosure.
- Alignment: navigation and reading content are left-aligned; only icon controls, the mobile title, empty-state question, and Inspector tabs are centered. The heading, conversation, notices, deliverables, and Composer share one 760px axis with no more than 1px geometric drift.
- Icon craft: all workspace glyphs use a shared 24px geometry, 1.75px rounded stroke, fixed non-shrinking sizes, and centered square hit areas. Any optical correction is registered centrally and limited to ±1px.
- Copy filter: do not surface ready-state runtime labels, smart-routing implementation copy, or “no paid task created” messages unless they change what the user should do. Cost, approval consequences, blockers, failure recovery, and verification remain explicit.
- Memorable moment: after the first message, the centered brief field settles at the bottom while the request opens into a calm conversation; the plan and operational trace stay anchored in the Inspector instead of becoming chat noise.
- Unresolved decisions: none for the initial implementation.
