import React from 'react';

export function SelectionPopup({ position, onGenerate }) {
  if (!position) return null;

  return (
    <div 
      className="absolute z-50 bg-white shadow-lg border border-gray-200 rounded-lg p-2 flex items-center gap-2 animate-in fade-in zoom-in duration-200"
      style={{ 
        top: position.top, 
        left: position.left,
        transform: 'translate(-50%, -100%) translateY(-5px)'
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button 
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onGenerate();
        }}
        className="bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
      >
        <span>✨</span>
        Explore this latent space
      </button>
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-white border-r border-b border-gray-200"></div>
    </div>
  );
}
