# spreadsheet@1

Purpose: create a structured XLSX with formulas, traceable inputs, and deterministic validation.

- Triggers: xlsx, spreadsheet, 表格, 清单, 汇总
- Required capabilities: `files`, `shell`
- Allowed tools: `update_plan`, `delegate_tasks`, `sandbox_shell`, `declare_artifact`
- Plan template: preserve raw inputs → create typed analysis sheets → add formulas and charts → open every sheet → scan formula errors → render → declare
- Delivery contract: use real typed cells and formulas, explicit units, stable sheet names, and a source column; keep raw evidence separate.
- Validation: `xlsx-open`, `xlsx-formulas`, `xlsx-render`
- Retry: repair failed cells, formulas, or layout once.
- Stop: every sheet and required formula passes validation.

Good: evidence sheet + issues sheet + formula-based summary.

Bad: paste precomputed totals as text and call them formulas.
