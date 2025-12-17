# Live2D Fixes & Optimization Report

**Date:** 2025-12-12
**Status:** Bugs Fixed & Module Cleaned

## 1. Bug Fixes (修复的 Bug)

### 1.1 Live2D Model Not Loading (Failed to load model)
- **Issue**: The application was trying to load `model_list.json` and `index.json` from the CDN path, which did not exist, causing a `404 (Unexpected token '<')` error.
- **Fix**:
  - Created `public/live2d/model_list.json` with the list of available models.
  - Updated `Live2DModelManager.ts` to look for `model.json` (standard Live2D v2 format) instead of `index.json`.
  - Confirmed paths align with the `public/live2d/model` directory structure.

### 1.2 Agent Interaction Error
- **Issue**: `Uncaught TypeError: event.currentTarget?.getBoundingClientRect is not a function` in `Agent.vue`.
- **Cause**: The `mousemove` event listener was attached to `window`, but the handler tried to access `getBoundingClientRect` on `window` (which doesn't exist).
- **Fix**: Removed the unused code block causing the error. The logic for eye tracking relies on global coordinates, so `getBoundingClientRect` on the target was unnecessary.

## 2. Code Cleanup (代码清理)

### 2.1 Removed Redundant Files
- Deleted `src/agent/live2d-widget/model`: Assets are now correctly served from `public/live2d/model`, removing duplication.
- Deleted `src/agent/live2d-widget/cubism5`: Removed unused Cubism 5 support to keep the module lean (using Cubism 2 for current models).
- Deleted `src/agent/live2d-widget/dist`: Removed unused build artifacts.

## 3. Current State (当前状态)
- **Agent**: Mouse tracking and interaction logic should now run without console errors.
- **Live2D**: The model should now appear correctly (not just the bubble) and cycle through the list defined in `model_list.json`.
- **Integration**: The `live2d-widget` module is now lean, using centralized services (`ModelManager`) and types.

## 4. Next Steps (下一步)
- **Verify Expressions**: Ensure the `setExpression` calls (e.g., for 'angry' state) map to valid expression files in the loaded model.
- **Memory**: Implement the local memory storage.
