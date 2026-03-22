# Features Implementation Plan

This document outlines the proposed features to enhance the Sketch2Mesh platform and their technical implementation details.

## 1. Model Library & Gallery 📚
**Goal**: Allow users to view and manage their previously generated 3D models.

### Proposed Changes
- **Backend**:
    - Ensure `GET /models` returns the latest models with their metadata.
- **Frontend**:
    - Create a `ModelLibrary` component to display a grid of saved models.
    - Add a "Save to Library" button in the main UI.
    - Implement a sidebar or modal to browse the library.

---

## 2. AR Preview (Augmented Reality) 📱
**Goal**: View generated models in the real world using mobile AR.

### Proposed Changes
- **Frontend**:
    - Integrate `<model-viewer>`'s AR attributes (`ar`, `ar-modes`, `camera-controls`).
    - Add a "View in AR" button that opens the model in a full-screen AR-capable view.
    - Generate a QR code for easy mobile access if on desktop.

---

## 3. Download & Export 📥
**Goal**: Export models for use in external 3D software.

### Proposed Changes
- **Frontend**:
    - Add a "Download .GLB" button next to the model viewer.
    - Use a simple anchor tag with the `download` attribute.

---

## 4. AI Prompt Assistant (Agentic) 🤖
**Goal**: Use Fetch.ai agents to enhance user prompts based on their sketches.

### Proposed Changes
- **Agent Service**:
    - Add a new agent function to "refine" a prompt.
- **Backend**:
    - Add a `POST /agent/refine-prompt` endpoint.
- **Frontend**:
    - Add a "Magic Wand" button next to the prompt input to trigger refinement.
