# Frontend for LeGenesis

This is the React frontend for the 3D generation pipeline.

## Setup

1. Install dependencies: `npm install`
2. Start development server: `npm run dev`
3. Build for production: `npm run build`

## Features

- Prompt input for describing the 3D object
- Sketch canvas for drawing rough sketches
- Generate button to start 3D generation
- Edit button for modifying existing models
- 3D model viewer using React Three Fiber
- Status polling for job progress

## API Integration

The frontend expects the backend API at `/api/` endpoints:
- POST `/api/generate` - Start a new generation job
- POST `/api/edit` - Edit an existing job
- GET `/api/status/{job_id}` - Poll job status

Note: Update the fetch URLs to match your backend server URL.