function PromptInput({ prompt, setPrompt }) {
  return (
    <div className="prompt-input">
      <input
        id="prompt"
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your 3D object"
      />
    </div>
  );
}

export default PromptInput;
