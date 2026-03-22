import { useState, useEffect } from 'react';
import './ModelLibrary.css';

function ModelLibrary({ onSelectModel, onClose }) {
    const [models, setModels] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchModels();
    }, []);

    const fetchModels = async () => {
        console.log('DEBUG: Fetching models from /models...');
        setIsLoading(true);
        try {
            const response = await fetch('/models');
            console.log('DEBUG: Fetch response status:', response.status);
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to fetch models: ${response.status} ${text}`);
            }
            const data = await response.json();
            console.log('DEBUG: Fetched models count:', data.items?.length);
            setModels(data.items || []);
        } catch (err) {
            console.error('DEBUG: Fetch models error:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
            console.log('DEBUG: Fetch models complete, isLoading set to false');
        }
    };

    const handleDownload = async (e, url, name) => {
        e.stopPropagation(); // Prevent selecting the model when clicking download
        const safeName = (name || 'model')
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase()
            .slice(0, 50);

        console.log(`DEBUG: Starting download for ${safeName} from ${url}`);
        try {
            const downloadUrl = `/models/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(safeName)}`;
            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            console.log('DEBUG: Received blob size:', blob.size, 'type:', blob.type);

            // Force the correct type for GLB
            const glbBlob = new Blob([blob], { type: 'model/gltf-binary' });
            const localUrl = window.URL.createObjectURL(glbBlob);

            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = localUrl;
            a.setAttribute('download', `${safeName}.glb`);
            document.body.appendChild(a);

            console.log('DEBUG: Triggering click on anchor tag with download attribute:', a.getAttribute('download'));
            a.click();

            // Small delay before cleanup to ensure browser triggers download
            setTimeout(() => {
                window.URL.revokeObjectURL(localUrl);
                document.body.removeChild(a);
                console.log('DEBUG: Cleanup complete');
            }, 500); // Increased delay for safety
        } catch (err) {
            console.error('DEBUG: Download error:', err);
            alert(`Download failed: ${err.message}`);
        }
    };

    return (
        <div className="model-library-overlay">
            <div className="model-library-content">
                <div className="library-header">
                    <h2>My 3D Models</h2>
                    <button className="close-button" onClick={onClose}>×</button>
                </div>

                {isLoading ? (
                    <div className="library-loading">Loading your library...</div>
                ) : error ? (
                    <div className="library-error">
                        <p>Error: {error}</p>
                        <button onClick={fetchModels}>Retry</button>
                    </div>
                ) : models.length === 0 ? (
                    <div className="library-empty">No models saved yet. Generate and save one!</div>
                ) : (
                    <div className="model-grid">
                        {models.map((model) => (
                            <div key={model.id} className="model-card" onClick={() => onSelectModel(model.object_url)}>
                                <div className="model-card-preview">
                                    <span className="model-icon">📦</span>
                                    <button
                                        className="card-download-button"
                                        onClick={(e) => handleDownload(e, model.object_url, model.name)}
                                        title="Download GLB"
                                    >
                                        📥
                                    </button>
                                </div>
                                <div className="model-card-info">
                                    <span className="model-name">{model.name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ModelLibrary;
