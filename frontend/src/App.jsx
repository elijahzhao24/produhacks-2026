import { useState, useRef, useEffect } from 'react';
import SketchCanvas from './components/SketchCanvas';
import ModelViewer from './components/ModelViewer';
import PromptInput from './components/PromptInput';
import ModelLibrary from './components/ModelLibrary';
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
  const [contextToken, setContextToken] = useState(null);
  const [strokeColor, setStrokeColor] = useState('#1f1f1f');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [toolMode, setToolMode] = useState('draw');
  const [darkMode, setDarkMode] = useState(false);
  const [selectedSketchObject, setSelectedSketchObject] = useState(null);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [desiredSpeed, setDesiredSpeed] = useState('fast');
  const [showLibrary, setShowLibrary] = useState(false);
  const sketchRef = useRef();
  const generationPanelRef = useRef(null);

  useEffect(() => {
    document.body.className = darkMode ? 'dark-theme' : '';
  }, [darkMode]);

  const uploadSketch = async () => {
    console.log('DEBUG: Starting sketch upload...');
    const sketchData = await sketchRef.current.exportImage('png');
    console.log('DEBUG: Exported image data length:', sketchData.length);

    // Convert data URL to Blob
    const res = await fetch(sketchData);
    const blob = await res.blob();
    console.log('DEBUG: Blob size:', blob.size);

    const formData = new FormData();
    formData.append('file', blob, 'sketch.png');

    const response = await fetch('/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DEBUG: Upload failed with status:', response.status, errorText);
      throw new Error(`Failed to upload sketch: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('DEBUG: Upload successful, URL:', data.url);
    return data.url;
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setStatus('Uploading sketch...');
    try {
      const sketchUrl = await uploadSketch();

      setStatus('Generating 3D model (this may take a few minutes)...');
      const response = await fetch('/sandbox/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          sketch_url: sketchUrl,
          desired_speed: desiredSpeed,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Generation failed');
      }

      const data = await response.json();
      setGlbUrl(data.model_url);
      setContextToken(data.context_token);
      setJobId('sandbox'); // Dummy ID to show Edit button
      setStatus('completed');
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async () => {
    setIsLoading(true);
    setStatus('Uploading updated sketch...');
    try {
      const sketchUrl = await uploadSketch();

      setStatus('Updating 3D model...');
      const response = await fetch('/sandbox/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          sketch_url: sketchUrl,
          context_token: contextToken,
          desired_speed: desiredSpeed,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Edit failed');
      }

      const data = await response.json();
      setGlbUrl(data.model_url);
      setContextToken(data.context_token);
      setStatus('completed');
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!contextToken) return;
    const name = prompt || 'Untitled Model';
    setIsLoading(true);
    setStatus('Saving to library...');
    try {
      const response = await fetch('/models/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          context_token: contextToken,
        }),
      });
      if (!response.ok) throw new Error('Failed to save model');
      setStatus('Saved to library!');
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
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
        <button className="library-toggle" onClick={() => setShowLibrary(true)}>
          <span className="icon">📚</span> My Library
        </button>
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
          <button onClick={handleGenerate} disabled={!prompt || isLoading}>
            {isLoading && status.includes('Generating') ? 'Generating...' : 'Generate'}
          </button>
          {jobId && (
            <button onClick={handleEdit} disabled={!prompt || isLoading}>
              {isLoading && status.includes('Updating') ? 'Updating...' : 'Edit'}
            </button>
          )}
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
            <button onClick={handleGenerate} disabled={!prompt || isLoading} className="action-pill primary-action">
              {isLoading && status.includes('Generating') ? 'Generating...' : 'Generate'}
            </button>
            {jobId && (
              <button onClick={handleEdit} disabled={!prompt || isLoading} className="action-pill secondary-action">
                {isLoading && status.includes('Updating') ? 'Updating...' : 'Edit'}
              </button>
            )}
            {glbUrl && (
              <button onClick={handleSave} disabled={isLoading} className="action-pill secondary-action">
                {isLoading && status.includes('Saving') ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
          <PromptInput prompt={prompt} setPrompt={setPrompt} />
          <div className="speed-selector">
            {['fast', 'balanced', 'best'].map((speed) => (
              <button
                key={speed}
                onClick={() => setDesiredSpeed(speed)}
                className={`speed-button ${desiredSpeed === speed ? 'active' : ''}`}
                title={`${speed.charAt(0).toUpperCase() + speed.slice(1)} Speed`}
              >
                {speed === 'fast' ? '⚡' : speed === 'balanced' ? '⚖' : '🏆'}
              </button>
            ))}
          </div>
          <button onClick={toggleTheme} className="settings-button" aria-label="Toggle theme">
            {darkMode ? '☀' : '⚙'}
          </button>
        </div>

        {status && <p className="status">Status: {status}</p>}
      </div>

      {showLibrary && (
        <ModelLibrary
          onSelectModel={(url) => {
            setGlbUrl(url);
            setShowLibrary(false);
          }}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}

export default App;
