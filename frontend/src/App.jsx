import { useState, useRef, useEffect } from 'react';
import SketchCanvas from './components/SketchCanvas';
import ModelViewer from './components/ModelViewer';
import PromptInput from './components/PromptInput';
import './App.css';

const PALETTE = ['#ffd147', '#ff5a36', '#2166c3', '#1f1f1f'];
const PEN_SIZES = [
  { value: 2, label: 'Fine' },
  { value: 4, label: 'Medium' },
  { value: 8, label: 'Bold' },
];

function App() {
  const [prompt, setPrompt] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [glbUrl, setGlbUrl] = useState(null);
  const [strokeColor, setStrokeColor] = useState('#1f1f1f');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [toolMode, setToolMode] = useState('draw');
  const [darkMode, setDarkMode] = useState(false);
  const [selectedSketchObject, setSelectedSketchObject] = useState(null);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const sketchRef = useRef();
  const generationPanelRef = useRef(null);

  useEffect(() => {
    document.body.className = darkMode ? 'dark-theme' : '';
  }, [darkMode]);

  const handleGenerate = async () => {
    const sketchData = await sketchRef.current.exportImage('png');
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('sketch', sketchData);
    if (selectedSketchObject) {
      formData.append('selected_object', JSON.stringify(selectedSketchObject));
    }

    const response = await fetch('/api/generate', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    setJobId(data.job_id);
    pollStatus(data.job_id);
  };

  const handleEdit = async () => {
    const sketchData = await sketchRef.current.exportImage('png');
    const formData = new FormData();
    formData.append('job_id', jobId);
    formData.append('prompt', prompt);
    formData.append('sketch', sketchData);
    if (selectedSketchObject) {
      formData.append('selected_object', JSON.stringify(selectedSketchObject));
    }

    const response = await fetch('/api/edit', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    setJobId(data.job_id);
    pollStatus(data.job_id);
  };

  const pollStatus = (id) => {
    const interval = setInterval(async () => {
      const response = await fetch(`/api/status/${id}`);
      const data = await response.json();
      setStatus(data.status);
      if (data.status === 'completed') {
        setGlbUrl(data.glb_url);
        clearInterval(interval);
      }
    }, 2000);
  };

  const handleClear = () => {
    sketchRef.current.clearCanvas();
    setSelectedSketchObject(null);
  };

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className="app">
      <header>
        <h1>Sketch2Mesh</h1>
      </header>
      <div className="top-section">
        <div className="panel left-panel">
          <h2>Sketch Your Idea</h2>
          <SketchCanvas 
            ref={sketchRef} 
            strokeColor={strokeColor} 
            strokeWidth={strokeWidth} 
            toolMode={toolMode}
            dropTargetRef={generationPanelRef}
            onSelectionDrop={(selection) => {
              setSelectedSketchObject(selection);
              setIsDropTargetActive(false);
            }}
            onSelectionDragStateChange={setIsDropTargetActive}
          />
        </div>
        <div ref={generationPanelRef} className={`panel right-panel ${isDropTargetActive ? 'drop-target-active' : ''}`}>
          <h2>Generated 3D Model</h2>
          {glbUrl ? (
            <ModelViewer glbUrl={glbUrl} />
          ) : selectedSketchObject ? (
            <div className="selection-preview">
              <img src={selectedSketchObject.previewUrl} alt="Selected sketch object" className="selection-preview-image" />
              <div className="selection-preview-copy">
                <strong>Object ready for generation</strong>
                <p>Drag-selected sketch captured. Your backend can now read `selected_object` from the generate request.</p>
              </div>
            </div>
          ) : (
            <div className="placeholder">Drag a selected sketch here to prepare it for 3D generation</div>
          )}
        </div>
      </div>
      <div className="bottom-section">
        <PromptInput prompt={prompt} setPrompt={setPrompt} />
        <div className="buttons">
          <button onClick={handleGenerate} disabled={!prompt}>Generate</button>
          {jobId && <button onClick={handleEdit} disabled={!prompt}>Edit</button>}
        </div>
        {status && <p className="status">Status: {status}</p>}
      </div>
      <div className="floating-controls">
        <div className="toolbar-row">
          <div className="tool-cluster">
            <button
              onClick={() => setToolMode('draw')}
              className={`tool-button ${toolMode === 'draw' ? 'active' : ''}`}
              aria-label="Pen tool"
              title="Pen"
            >
              <span className="tool-icon">✎</span>
              <span className="tool-label">Pen</span>
            </button>
            <button
              onClick={() => setToolMode('select')}
              className={`tool-button ${toolMode === 'select' ? 'active' : ''}`}
              aria-label="Select tool"
              title="Select"
            >
              <span className="tool-icon">⬚</span>
              <span className="tool-label">Select</span>
            </button>
            <button
              onClick={() => setToolMode('erase')}
              className={`tool-button ${toolMode === 'erase' ? 'active' : ''}`}
              aria-label="Eraser tool"
              title="Eraser"
            >
              <span className="tool-icon">⌫</span>
              <span className="tool-label">Erase</span>
            </button>
            <button onClick={handleClear} className="tool-button" aria-label="Clear canvas" title="Clear">
              <span className="tool-icon">×</span>
              <span className="tool-label">Clear</span>
            </button>
          </div>

          <div className="color-rail" role="group" aria-label="Color palette">
            {PALETTE.map((color) => (
              <button
                key={color}
                className={`color-segment ${strokeColor === color ? 'active' : ''}`}
                style={{ '--swatch-color': color }}
                onClick={() => {
                  setToolMode('draw');
                  setStrokeColor(color);
                }}
                aria-label={`Set stroke color to ${color}`}
              />
            ))}
            <label className={`custom-color-trigger ${!PALETTE.includes(strokeColor) ? 'active' : ''}`} aria-label="Choose custom color">
              <span className="custom-color-dot" style={{ backgroundColor: strokeColor }} />
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => {
                  setToolMode('draw');
                  setStrokeColor(e.target.value);
                }}
                className="custom-color-picker"
              />
            </label>
          </div>

          <div className="size-cluster" role="group" aria-label="Pen size">
            {PEN_SIZES.map((size) => (
              <button
                key={size.value}
                onClick={() => {
                  setToolMode('draw');
                  setStrokeWidth(size.value);
                }}
                className={`size-button ${strokeWidth === size.value && toolMode === 'draw' ? 'active' : ''}`}
                aria-label={`${size.label} pen size`}
              >
                <span className={`size-dot size-${size.value}`} />
              </button>
            ))}
          </div>
        </div>

        <div className="action-row">
          <div className="buttons action-buttons">
            <button onClick={handleGenerate} disabled={!prompt} className="action-pill primary-action">
              Generate
            </button>
            {jobId && (
              <button onClick={handleEdit} disabled={!prompt} className="action-pill secondary-action">
                Edit
              </button>
            )}
          </div>
          <PromptInput prompt={prompt} setPrompt={setPrompt} />
          <button onClick={toggleTheme} className="settings-button" aria-label="Toggle theme">
            {darkMode ? '☀' : '⚙'}
          </button>
        </div>

        {status && <p className="status">Status: {status}</p>}
      </div>
    </div>
  );
}

export default App;
