# Optimization and Bug Fix Report (Deep Optimization Phase)

## 1. Critical Bug Fixes

### 1.1 Red Block & Model Disappearance
**Issue:**
- A persistent red block appeared when entering/exiting projects or toggling chat.
- The Live2D model would disappear (leaving only the bubble) after closing the chat window or navigating.

**Root Cause:**
- Improper WebGL context cleanup when the `Live2DWidget` component was unmounted.
- `waifu-tips.js` (the Live2D library) left residual DOM elements (`#waifu`, `#waifu-tips`) and event listeners that conflicted with re-initialization.
- Canvas element was not being removed cleanly, leading to visual artifacts (red background from lost context).

**Fix:**
- Implemented aggressive cleanup in `Live2DWidget.vue`:
  - Forcefully loses WebGL context using `WEBGL_lose_context` extension.
  - Manually removes `#waifu`, `#waifu-tips`, `#waifu-tool`, and `#live2dcanvas` from the DOM.
  - Resets `ModelManager` to null to prevent stale state access.

### 1.2 Model Teleportation on Hover
**Issue:**
- Hovering over the agent while it was moving (roaming) caused it to snap/teleport to a new location.

**Root Cause:**
- The transition from CSS-based animation (smooth roaming) to JavaScript-based positioning (mouse interaction) caused a coordinate mismatch. The reactive state `x, y` was not updated to match the *current* visual position of the animating element when the animation was interrupted.

**Fix:**
- In `Agent.vue` (`handleMouseEnter`):
  - Used `window.getComputedStyle(el).transform` and `DOMMatrix` to capture the exact current on-screen position of the agent.
  - Synced the reactive `x` and `y` variables to this visual position before disabling the CSS transition.

### 1.3 API & Network Failures
**Issue:**
- All AI interface calls were failing ("I'm not sure what to say..." or network errors).

**Root Cause:**
- Backend (`server.js`) was configured to use `gemini-2.5-flash`, which is an invalid/non-existent model name (should be `gemini-1.5-flash`).
- Timeouts were too short (10s) for some network environments, causing premature failures.

**Fix:**
- Updated `server.js` to use `gemini-1.5-flash`.
- Increased API generation timeout to 30 seconds.

## 2. Model Optimization (Xier)

### 2.1 Default Model Switch
- Verified `Live2DWidget.vue` is configured to use `modelId: 3`, which corresponds to "Xier" in `model_list.json`.

### 2.2 Model Adaptation
- **Issue:** The Xier model was missing standard motion keys (`tap_body`, `talking`) and explicit expression definitions expected by the widget.
- **Fix:** Modified `public/live2d/model/BengHuai/xier/model.json`:
  - Added `expressions` section mapping `f01`...`f07` to their respective JSON files.
  - Added `tap_body` mapping (aliased to `tap_face`).
  - Added `talking` mapping (aliased to `idle`).

## 3. General Project Health
- **Frontend**: Verified `Agent.vue` and `Live2DWidget.vue` integration.
- **Backend**: Verified `server.js` configuration.
- **Docs**: Updated this report.

## Next Steps
- Verify the fixes in the live environment.
- Continue monitoring for "Red Block" in edge cases (e.g., rapid navigation).
