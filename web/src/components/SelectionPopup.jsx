import React from 'react';

export function SelectionPopup({ position, selectedText, contextTopic, onNavigate }) {
  if (!position) return null;

  const query = contextTopic ? `${selectedText} (context: ${contextTopic})` : selectedText;

  const handleExplore = () => {
    onNavigate(query);
  };

  const handleNewTab = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('topic', query);
    window.open(url.toString(), '_blank');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedText);
  };

  return (
    <div 
      className="absolute z-50 bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 rounded-lg p-1 flex items-center gap-1 animate-in fade-in zoom-in duration-200"
      style={{ 
        top: position.top, 
        left: position.left,
        transform: 'translate(-50%, -100%) translateY(-5px)'
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button 
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleExplore(); }}
        className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
        title="Explore this latent"
      >
        <span>✨</span> Explore
      </button>
      
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1"></div>

      <button 
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleNewTab(); }}
        className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1.5 rounded transition-colors"
        title="Open in new tab"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
      </button>

      <button 
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleCopy(); }}
        className="text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 p-1.5 rounded transition-colors"
        title="Copy text"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>

      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-white dark:bg-gray-800 border-r border-b border-gray-200 dark:border-gray-700"></div>
    </div>
  );
}
