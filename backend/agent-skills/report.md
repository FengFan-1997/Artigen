# report@1

Purpose: create a cited editable report and a readable verified PDF.

- Triggers: report, pdf, 报告, 提案, 文档
- Required capabilities: `files`, `shell`
- Allowed tools: `update_plan`, `delegate_tasks`, `sandbox_shell`, `declare_artifact`
- Plan template: outline → write editable source → convert to PDF when requested → extract text → render pages → repair → declare
- Delivery contract: deliver editable Markdown or DOCX plus PDF when PDF is requested; a PDF preview never replaces editable source.
- Validation: `report-source`, `pdf-text`, `pdf-render`
- Retry: one targeted content or rendering repair.
- Stop: editable source and every requested PDF pass deterministic validation.

Good: Markdown source → PDF → text extraction → page render → declare both.

Bad: declare a PDF immediately after conversion without inspecting it.
