import { useState, useRef, useEffect } from 'react';
import { ReactSketchCanvas } from 'react-sketch-canvas';
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
  const [lastGeneratedPrompt, setLastGeneratedPrompt] = useState('');
  const [uploadedSketchUrl, setUploadedSketchUrl] = useState(null);
  const [autoRefine, setAutoRefine] = useState(false);
  const sketchRef = useRef();
  const fileInputRef = useRef();
  const generationPanelRef = useRef(null);
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    document.body.className = darkMode ? 'dark-theme' : '';
  }, [darkMode]);

  const onSketchChange = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (prompt) {
        // Smart logic: if prompt changed radically, start fresh. 
        // Otherwise, refine the existing model.
        if (jobId && prompt === lastGeneratedPrompt) {
          handleEdit();
        } else {
          handleGenerate();
        }
      }
    }, 2000); // 2 second debounce for better responsiveness
  };

  // Trigger auto-update when prompt changes
  useEffect(() => {
    if (prompt && prompt !== lastGeneratedPrompt) {
      onSketchChange();
    }
  }, [prompt]);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setStatus('Uploading sketch file...');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to upload file');
      const data = await response.json();
      setUploadedSketchUrl(data.url);
      setStatus('Sketch uploaded!');
      onSketchChange(); // Trigger auto-update
    } catch (err) {
      console.error(err);
      setStatus(`Upload error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadSketch = async () => {
    if (uploadedSketchUrl) {
      console.log('DEBUG: Using uploaded sketch URL:', uploadedSketchUrl);
      return uploadedSketchUrl;
    }

    console.log('DEBUG: Starting sketch export from canvas...');
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
          auto_refine: autoRefine,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Generation failed');
      }

      const data = await response.json();
      setGlbUrl(data.model_url);
      setContextToken(data.context_token);
      setLastGeneratedPrompt(prompt);
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
          auto_refine: autoRefine,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Edit failed');
      }

      const data = await response.json();
      setGlbUrl(data.model_url);
      setContextToken(data.context_token);
      setLastGeneratedPrompt(prompt);
      setStatus('completed');
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!contextToken) {
      console.warn('DEBUG: Cannot save, contextToken is null');
      return;
    }
    const name = prompt || 'Untitled Model';
    console.log('DEBUG: Saving model with name:', name, 'and token:', contextToken.slice(0, 20) + '...');
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
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to save model');
      }
      setStatus('Saved to library!');
    } catch (err) {
      console.error('DEBUG: Save error:', err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!glbUrl) return;
    const safeName = (prompt || 'model')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .slice(0, 50);

    setStatus('Preparing download...');
    try {
      const downloadUrl = `/models/download?url=${encodeURIComponent(glbUrl)}&filename=${encodeURIComponent(safeName)}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const localUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = localUrl;
      a.setAttribute('download', `${safeName}.glb`);
      document.body.appendChild(a);
      a.click();

      // Small delay before cleanup to ensure browser triggers download
      setTimeout(() => {
        window.URL.revokeObjectURL(localUrl);
        document.body.removeChild(a);
      }, 100);

      setStatus('Download complete!');
    } catch (err) {
      console.error('Download error:', err);
      setStatus(`Download failed: ${err.message}`);
    }
  };

  const handleClear = () => {
    sketchRef.current.clearCanvas();
    setSelectedSketchObject(null);
    setUploadedSketchUrl(null);
  };

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <h1>LeGenesis</h1>
          {status && (
            <div className={`status-badge ${isLoading ? 'active' : ''}`}>
              <span className="dot" />
              {status.replace('completed', 'Ready').replace('Error:', 'Failed')}
            </div>
          )}
        </div>
        <div className="header-right">
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {darkMode ? '☀' : '🌙'}
          </button>
          <button className="library-toggle" onClick={() => setShowLibrary(true)}>
            <span className="icon">📚</span> My Library
          </button>
        </div>
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
            onChange={onSketchChange}
            backgroundImageUrl={uploadedSketchUrl}
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
            <button
              onClick={() => fileInputRef.current.click()}
              className="tool-button"
              aria-label="Upload sketch"
              title="Upload"
            >
              <span className="tool-icon">📤</span>
              <span className="tool-label">Upload</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
              accept="image/*"
            />
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

        <div className="prompt-row">
          <PromptInput prompt={prompt} setPrompt={setPrompt} />
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
              <>
                <button onClick={handleSave} disabled={isLoading} className="action-pill secondary-action">
                  {isLoading && status.includes('Saving') ? 'Saving...' : 'Save'}
                </button>
                <button onClick={handleDownload} className="action-pill secondary-action">
                  Download
                </button>
              </>
            )}
            <button
              onClick={() => setAutoRefine(!autoRefine)}
              className={`action-pill ${autoRefine ? 'primary-action' : 'secondary-action'}`}
              style={{ marginLeft: '8px', whiteSpace: 'nowrap' }}
              title="Auto-refine sketch with AI"
            >
              {autoRefine ? 'Refine: ON' : 'Refine: OFF'}
            </button>
          </div>
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
