import React, { useState, useEffect } from 'react';

export function ApiKeyModal({ isOpen, onClose, onSave }) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-oss-120b');
  const [style, setStyle] = useState('elaborative');

  useEffect(() => {
    if (isOpen) {
      const savedKey = localStorage.getItem('cerebras_api_key');
      if (savedKey) {
        setApiKey(savedKey);
      }
      const savedModel = localStorage.getItem('cerebras_model');
      if (savedModel) {
        setModel(savedModel);
      }
      const savedStyle = localStorage.getItem('cerebras_style');
      if (savedStyle) {
        setStyle(savedStyle);
      }
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    let cleanKey = apiKey.trim();
    if (cleanKey.startsWith('Bearer ')) {
      cleanKey = cleanKey.slice(7).trim();
    }
    onSave(cleanKey, model, style);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-serif font-bold mb-4">Settings</h2>
        <p className="text-gray-600 mb-4 text-sm leading-relaxed">
          This demo is built for <strong>Cerebras</strong>. Because of the extreme speed (&gt;1000 tokens/sec), 
          it can generate entire pages instantly, mimicking the feel of a pre-rendered website rather than a slow LLM stream.
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="csk-..."
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Model (Smart to Smartest)</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="qwen-3-32b">qwen-3-32b</option>
              <option value="gpt-oss-120b">gpt-oss-120b</option>
              <option value="qwen-3-235b-a22b-instruct-2507">qwen-3-235b-a22b-instruct-2507</option>
              <option value="zai-glm-4.6">zai-glm-4.6</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Select the intelligence level for generation.</p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Article Style</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="short">Short but Sweet (&lt; 5k tokens)</option>
              <option value="elaborative">Elaborative (&gt; 5k tokens)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Choose the depth and length of generated articles.</p>
          </div>
          
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save Key
            </button>
          </div>
        </form>
        
        <div className="mt-4 text-xs text-gray-400 text-center">
          Don't have a key? <a href="https://cloud.cerebras.ai/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Get one here</a>
        </div>
      </div>
    </div>
  );
}
