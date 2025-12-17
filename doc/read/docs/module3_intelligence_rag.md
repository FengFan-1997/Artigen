# Module 3: Intelligence & RAG - Implementation Log

**Date:** 2025-12-11
**Module:** III. Intelligence & RAG
**Status:** In Progress (Basic Chat & API Connected)

## 1. What was done
- **Created `ChatWindow.vue`:**
  - Designed a clean, floating chat interface.
  - Features: Message history (user/agent), typing indicator, auto-scroll.
  - Integrated with `Agent.vue` using a pop-up animation.
- **Implemented `aiService.ts`:**
  - Created a service to communicate with the backend (`/api/generate`).
  - Constructed a personality prompt for the Agent ("helpful, cute, and witty").
  - Handles API errors gracefully.
- **Backend Integration:**
  - Connected the frontend `aiService` to the existing `backend/server.js` endpoint.
  - The Agent can now send prompts to the Gemini API and display responses.

## 2. Integration Details
- **Trigger:** Clicking the Agent now opens the Chat Window instead of just showing a text bubble.
- **State Management:**
  - Pauses "Roaming" and "Dizzy" checks when the chat is open to prevent the Agent from walking away while you type.
  - Clears the speech bubble when the chat opens.

## 3. Limitations & Next Steps
- **RAG (Retrieval-Augmented Generation):**
  - Currently, the backend only supports direct generation (`/api/generate`).
  - **Missing:** Vector database setup and document embedding. The Agent doesn't "know" the website content yet.
  - **Plan:** Next step is to implement the RAG pipeline (Module 3 Part 2) or move to Module 5 (Memory).
- **History:** The current API implementation in `server.js` seems to be stateless (one-shot prompt). The frontend sends history context in the prompt text, which is a temporary workaround.

## 4. Notes
- The backend `server.js` uses `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`.
- Frontend assumes the backend is running on `http://localhost:8080`.
