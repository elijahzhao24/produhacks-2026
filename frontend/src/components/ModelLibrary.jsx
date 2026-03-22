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
        setIsLoading(true);
        try {
            const response = await fetch('/models');
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            setModels(data.items);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
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
                    <div className="library-error">Error: {error}</div>
                ) : models.length === 0 ? (
                    <div className="library-empty">No models saved yet. Generate and save one!</div>
                ) : (
                    <div className="model-grid">
                        {models.map((model) => (
                            <div key={model.id} className="model-card" onClick={() => onSelectModel(model.object_url)}>
                                <div className="model-card-preview">
                                    <span className="model-icon">📦</span>
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
