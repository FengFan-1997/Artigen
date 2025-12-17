# Live2D Rendering & Behavior Fixes (2025-12-15)

## 1. WebGL Context Loss & Model Disappearance
- **Issue**: Model disappears after tab switch or double click.
- **Cause**: WebGL context loss (`webglcontextlost`) not handled; context creation failure.
- **Fix**:
  - Added `webglcontextlost` and `webglcontextrestored` listeners in `index.js`.
  - Implemented automatic model reloading on context restoration.
  - Added fallbacks for `webgl`, `experimental-webgl`, `webkit-3d`, `moz-webgl`.
  - Verified `changeModelWithJSON` correctly reinitializes the model.

## 2. Model Size & Clipping
- **Issue**: Model cut off by container boundaries.
- **Cause**: Model projection width (`2.0`) was too small relative to model size, causing it to fill screen and clip.
- **Fix**:
  - Adjusted `LAppModel.js` `modelMatrix.setWidth(2.4)` (zoomed out) to fit model within canvas.
  - Verified `Live2DWidget.vue` container scaling logic.

## 3. Movement & Roaming Behavior
- **Issue**: Model moves too fast, roams too frequently ("runs around").
- **Fix**:
  - Reduced `LERP_FACTOR` in `Agent.vue` from `0.05` to `0.005` (1/10th speed).
  - Increased `MOVE_INTERVAL` in `Agent.vue` from 8s to 20s.
  - Reduced random movement frequency.

## 4. Localization (English -> Chinese)
- **Issue**: Bubbles, dialogs, and voice were English-only; didn't follow language switch.
- **Fix**:
  - Disabled built-in English idle messages in `widget.ts` via `disableIdle: true`.
  - Implemented localized `idleMessages` (en/zh) in `Agent.vue`.
  - Localized `welcomeMessage`, history restoration text, and reaction text ("Oops/借过").
  - Updated `speak()` in `Agent.vue` to dynamically set `utterance.lang` (`zh-CN` / `en-US`) and select appropriate voice.

## 5. Interaction & "Squish" Effect
- **Issue**: "Squish" triggered by clicking model (unwanted) and not just by head hitting top.
- **Fix**:
  - Identified `tap_body` motion as the "squish-like" reaction on click.
  - Modified `LAppLive2DManager.js` to trigger `shake` instead of `tap_body` on body click, or disabled it.
  - Confirmed `triggerHeadHit` in `Agent.vue` (triggered by `y <= 10`) controls the CSS `squash` animation for head-hitting-top effect.

## 6. Chat Window Dragging
- **Issue**: Dragging chat window dragged the agent.
- **Fix**:
  - Added `@mousedown.stop` and `@touchstart.stop` to `ChatWindow` component in `Agent.vue` to prevent event propagation.

## 7. Sound Errors
- **Issue**: `NotAllowedError` (Autoplay policy) flooding logs.
- **Fix**:
  - Wrapped `snd.play()` in `LAppModel.js` with error suppression for `NotAllowedError` and `NotSupportedError`.

## 8. Logging
- **Action**:
  - Enabled `logLevel: 'info'` in `Live2DWidget.vue`.
  - Added debug logs for model loading and hit testing.
