function PromptInput({ prompt, setPrompt }) {
  return (
    <div className="prompt-input">
      <label htmlFor="prompt">Describe your 3D object:</label>
      <input
        id="prompt"
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g., A red sports car with racing stripes"
        style={{ width: '400px', padding: '10px', fontSize: '16px', border: '1px solid #ccc', borderRadius: '4px' }}
      />
    </div>
  );
}

export default PromptInput;