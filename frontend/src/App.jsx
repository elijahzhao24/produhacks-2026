import { useState, useRef, useEffect } from 'react';
import SketchCanvas from './components/SketchCanvas';
import ModelViewer from './components/ModelViewer';
import PromptInput from './components/PromptInput';
import './App.css';

function App() {
  const [prompt, setPrompt] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [glbUrl, setGlbUrl] = useState(null);
  const [strokeColor, setStrokeColor] = useState('black');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [eraseMode, setEraseMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const sketchRef = useRef();

  useEffect(() => {
    document.body.className = darkMode ? 'dark-theme' : '';
  }, [darkMode]);

  const handleGenerate = async () => {
    const sketchData = await sketchRef.current.exportImage('png');
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('sketch', sketchData);

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
  };

  const toggleErase = () => {
    setEraseMode(!eraseMode);
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
            eraseMode={eraseMode} 
          />
        </div>
        <div className="panel right-panel">
          <h2>Generated 3D Model</h2>
          {glbUrl ? <ModelViewer glbUrl={glbUrl} /> : <div className="placeholder">Model will appear here</div>}
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
        <div className="drawing-tools">
          <button onClick={toggleTheme} className="theme-toggle">
            {darkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
          <div className="color-palette">
            <span>🎨 Colors:</span>
            <button 
              className={`color-swatch ${strokeColor === '#000000' ? 'active' : ''}`} 
              style={{ backgroundColor: '#000000' }} 
              onClick={() => setStrokeColor('#000000')}
            ></button>
            <button 
              className={`color-swatch ${strokeColor === '#FF0000' ? 'active' : ''}`} 
              style={{ backgroundColor: '#FF0000' }} 
              onClick={() => setStrokeColor('#FF0000')}
            ></button>
            <button 
              className={`color-swatch ${strokeColor === '#0000FF' ? 'active' : ''}`} 
              style={{ backgroundColor: '#0000FF' }} 
              onClick={() => setStrokeColor('#0000FF')}
            ></button>
            <button 
              className={`color-swatch ${strokeColor === '#00FF00' ? 'active' : ''}`} 
              style={{ backgroundColor: '#00FF00' }} 
              onClick={() => setStrokeColor('#00FF00')}
            ></button>
            <button 
              className={`color-swatch ${strokeColor === '#FFFF00' ? 'active' : ''}`} 
              style={{ backgroundColor: '#FFFF00' }} 
              onClick={() => setStrokeColor('#FFFF00')}
            ></button>
            <button 
              className={`color-swatch ${strokeColor === '#FF00FF' ? 'active' : ''}`} 
              style={{ backgroundColor: '#FF00FF' }} 
              onClick={() => setStrokeColor('#FF00FF')}
            ></button>
            <input 
              type="color" 
              value={strokeColor} 
              onChange={(e) => setStrokeColor(e.target.value)} 
              className="custom-color-picker"
            />
          </div>
          <div className="pen-sizes">
            <button onClick={() => setStrokeWidth(2)} className={strokeWidth === 2 && !eraseMode ? 'active' : ''}>Small</button>
            <button onClick={() => setStrokeWidth(4)} className={strokeWidth === 4 && !eraseMode ? 'active' : ''}>Medium</button>
            <button onClick={() => setStrokeWidth(8)} className={strokeWidth === 8 && !eraseMode ? 'active' : ''}>Large</button>
          </div>
          <button onClick={toggleErase} className={eraseMode ? 'active' : ''}>🧽 Eraser</button>
          <button onClick={handleClear}>🗑️ Clear</button>
        </div>
        <PromptInput prompt={prompt} setPrompt={setPrompt} />
        <div className="buttons">
          <button onClick={handleGenerate} disabled={!prompt}>🚀 Generate</button>
          {jobId && <button onClick={handleEdit} disabled={!prompt}>✏️ Edit</button>}
        </div>
        {status && <p className="status">Status: {status}</p>}
      </div>
    </div>
  );
}

export default App;