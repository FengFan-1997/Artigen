# Module 2: Advanced Interactivity - Implementation Log

**Date:** 2025-12-11
**Module:** II. Core Advanced Interactivity
**Status:** Completed

## 1. What was done
- **Mouse Follow (Lerp Algorithm):**
  - Implemented a `requestAnimationFrame` loop.
  - When the user hovers over the agent (or interacts), the Agent now smoothly interpolates its position towards the mouse cursor using `x += (target - x) * 0.08`.
  - Added a state switch: When hovering, CSS transitions are disabled (`transition: none`) to allow JS to control the position frame-by-frame without lag. When roaming (idle), CSS transitions take over for smooth long-distance movement.
- **Eye Tracking:**
  - Calculated the angle between the Agent's center and the mouse cursor using `Math.atan2(dy, dx)`.
  - The pupils (`.agent-eye`) now move within a small radius (3px) in the direction of the cursor, creating a realistic "looking" effect.
- **Dizziness Mechanic:**
  - Implemented a gesture detection system that tracks mouse positions over the last 500ms.
  - Calculates the cumulative angular change of the mouse relative to the Agent.
  - **Trigger:** If the mouse circles the agent by more than 270 degrees (approx 4.7 radians) within 0.5 seconds, the `isDizzy` state is triggered.
  - **Effect:**
    - Agent stops following.
    - Displays a "Whoa! I'm dizzy..." bubble.
    - Plays a CSS spin animation (`dizzy-spin`).
    - Stars appear above the head.
    - Lasts for 3 seconds before recovering.

## 2. Next Steps (Module 3)
- **Backend Connection:** Connect the Agent to the existing `/backend/server.js` API.
- **Chat Interface:** Upgrade the simple Speech Bubble to a full Chat UI (or expand the bubble logic) to support Q&A.
- **RAG Implementation:** Vectorize the project documentation/content to allow the Agent to answer specific questions about the portfolio.

## 3. Notes
- The Lerp factor of `0.08` feels snappy yet smooth.
- Dizziness detection is robust but requires the user to circle *around* the agent's center.
