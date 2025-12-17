# Phase 7: Brain Upgrade - True AI Automation

## Goal
Transform the Agent from a "blind command executor" into a **Context-Aware AI Assistant** that can perceive the page, reason about its actions, and autonomously navigate complex UIs.

## Key Features

### 1. Visual Perception (The "Eyes")
- **`getPageContext()` Utility**: 
  - Automatically scans the DOM for interactive elements (Buttons, Links, Inputs).
  - Extracts key metadata: Tag, Text, IDs, Classes, Roles.
  - Filters out invisible or irrelevant elements.
  - Generates a "Map" of the current page state.

### 2. Context Injection (The "Brain")
- **Backend Integration**:
  - The `pageContext` is sent to the LLM along with the user's message.
  - The System Prompt is updated to include a **"Current Page Context"** section.
  - The LLM no longer needs to guess selectors; it can "see" them in the provided JSON list.

### 3. Reasoning Engine (The "Thoughts")
- **Chain of Thought**:
  - The System Prompt now requires the Agent to output a **"Thought:"** block before executing commands.
  - This explains *why* it chose a specific action (e.g., "I see a login button, so I will click it").
  - Users can see this reasoning in the chat window, making the AI feel more intelligent and transparent.

### 4. Robust Selector Strategy
- **Priority Logic**:
  1. **Visual Match**: If the element is in the Page Context, use its known properties.
  2. **ID/Class**: Use specific selectors if available.
  3. **Text Fallback**: Use `text:<content>` for dynamic elements.

## Technical Implementation

### Frontend
- **`src/agent/utils/pageContext.ts`**: New utility to traverse DOM and build the context tree.
- **`src/agent/services/aiService.ts`**: Updated to capture context before every API call.

### Backend
- **`server.js`**: 
  - Updated `/api/chat` to accept `pageContext`.
  - Refined System Prompt with "Current Page Context" and "Reasoning Requirement".
  - Cleaned up prompt syntax to be more robust.

## Result
The Agent can now handle requests like "Click the blue button" or "Login" without needing hardcoded rules, as it can dynamically find the "Login" button on the page and understand its attributes.
