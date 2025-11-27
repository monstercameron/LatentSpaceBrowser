import { useState, useEffect } from 'react'
import { useHistory } from './hooks/useHistory';
import { generateArticle, generateJourneySummary } from './services/ai';
import { Article } from './components/Article';
import { ApiKeyModal } from './components/ApiKeyModal';
import './App.css'

function App() {
  const { current, push, back, forward, canGoBack, canGoForward, history, clear } = useHistory();
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [homeContent, setHomeContent] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('latent_browser_dark_mode');
    return saved ? JSON.parse(saved) : false;
  });

  // Handle Dark Mode
  useEffect(() => {
    localStorage.setItem('latent_browser_dark_mode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const [lastJourney, setLastJourney] = useState(() => {
    try {
      const saved = localStorage.getItem('latent_browser_last_journey');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persist last journey
  useEffect(() => {
    localStorage.setItem('latent_browser_last_journey', JSON.stringify(lastJourney));
  }, [lastJourney]);

  // Sync search query with current topic when history changes (e.g. back/forward or restore)
  useEffect(() => {
    if (current?.topic) {
      setSearchQuery(current.topic);
      if (current.metrics) {
        setMetrics(current.metrics);
      }
      window.scrollTo(0, 0);
    }
  }, [current]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    await navigateToTopic(searchQuery);
  };

  const handleSaveApiKey = (key, model, style) => {
    localStorage.setItem('cerebras_api_key', key);
    if (model) {
      localStorage.setItem('cerebras_model', model);
    }
    if (style) {
      localStorage.setItem('cerebras_style', style);
    }
    // Optionally reload or just let the next request pick it up
    // Reloading ensures everything is fresh
    window.location.reload();
  };

  const handleHome = async () => {
    if (history.length > 0) {
      const journey = [...history];
      setLastJourney(journey);
      clear();
      
      // Generate AI summary of the journey
      setIsLoading(true);
      try {
        const { content: summaryHtml, metrics: summaryMetrics } = await generateJourneySummary(journey);
        setHomeContent(summaryHtml);
        setMetrics(summaryMetrics);
      } catch (e) {
        console.error("Failed to generate journey summary", e);
        if (e.message.includes('401') || e.message.includes('No API key')) {
          setIsApiKeyModalOpen(true);
          alert("Authentication failed. Please check your API Key.");
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      // Just go home if no history
      clear();
      setMetrics(null);
    }
    setSearchQuery('');
  };

  const navigateToTopic = async (topic) => {
    setIsLoading(true);
    try {
      const historyTopics = history.map(h => h.topic);
      const style = localStorage.getItem('cerebras_style') || 'elaborative';
      const { content, metrics: articleMetrics } = await generateArticle(topic, historyTopics, style);
      push({ topic, content, metrics: articleMetrics });
      setMetrics(articleMetrics);
      setSearchQuery(topic); // Update search bar to reflect current topic
    } catch (error) {
      console.error("Failed to load article:", error);
      if (error.message.includes('401') || error.message.includes('No API key')) {
        setIsApiKeyModalOpen(true);
        alert("Authentication failed. Please check your API Key.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 font-sans text-gray-900 dark:text-gray-100 transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 p-4 flex items-center justify-between sticky top-0 z-10 shadow-sm transition-colors duration-200">
        {/* Left: Logo */}
        <div className="flex items-center gap-4 w-1/4 min-w-fit">
            <div className="text-2xl font-serif font-bold tracking-tight cursor-pointer" onClick={handleHome}>
                <span className="text-black dark:text-white">Latent</span><span className="text-gray-600 dark:text-gray-400">Space</span>
            </div>
            <div className="hidden xl:block text-sm text-gray-500 dark:text-gray-400 italic truncate">The Free Encyclopedia of Latents</div>
        </div>
        
        {/* Center: Nav + Search */}
        <div className="flex-1 flex items-center justify-center gap-4 max-w-3xl px-4">
            {/* Navigation Controls */}
            <div className="flex items-center gap-1 shrink-0">
                <button 
                    onClick={back} 
                    disabled={!canGoBack}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${!canGoBack ? 'text-gray-300 dark:text-gray-600' : 'text-gray-600 dark:text-gray-300'}`}
                >
                    ←
                </button>
                <button 
                    onClick={forward} 
                    disabled={!canGoForward}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${!canGoForward ? 'text-gray-300 dark:text-gray-600' : 'text-gray-600 dark:text-gray-300'}`}
                >
                    →
                </button>
            </div>

            <form onSubmit={handleSearch} className="relative w-full max-w-lg">
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search LatentSpace..." 
                    className="w-full border border-gray-300 dark:border-gray-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-white"
                />
                <button type="submit" className="absolute right-0 top-0 h-full px-4 bg-blue-600 text-white rounded-r hover:bg-blue-700 font-medium">
                    Search
                </button>
            </form>
        </div>
        
        {/* Right: Actions */}
        <div className="flex items-center justify-end gap-4 w-1/4 min-w-fit">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>

            <div 
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium whitespace-nowrap"
              onClick={() => setIsApiKeyModalOpen(true)}
            >
              BYOK
            </div>
        </div>
      </header>

      <ApiKeyModal 
        isOpen={isApiKeyModalOpen} 
        onClose={() => setIsApiKeyModalOpen(false)} 
        onSave={handleSaveApiKey} 
      />

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-6 bg-white dark:bg-gray-900 mt-6 shadow-sm min-h-[80vh] flex gap-8 transition-colors duration-200">
        
        {/* Article Content */}
        <div className="flex-1">
            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="text-xl text-gray-500 dark:text-gray-400 animate-pulse">Generating article from latent space...</div>
                </div>
            ) : current ? (
                <Article topic={current.topic} content={current.content} onNavigate={navigateToTopic} />
            ) : homeContent ? (
                <Article topic="Journey Retrospective" content={homeContent} onNavigate={navigateToTopic} />
            ) : (
                <div className="text-center mt-20">
                    <h1 className="text-4xl font-serif mb-4 text-gray-900 dark:text-gray-100">Welcome to LatentSpace</h1>
                    <p className="text-gray-600 dark:text-gray-400 text-lg mb-12">Search for any topic to generate a Wikipedia-style article instantly.</p>
                </div>
            )}
        </div>

      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto mt-8 p-6 text-sm text-gray-500 dark:text-gray-400 text-center border-t border-gray-200 dark:border-gray-700 transition-colors duration-200">
        {metrics && (
          <div className="mb-4 flex justify-center gap-6 text-xs font-mono text-gray-400 dark:text-gray-500">
            <span>TTFT: {metrics.ttft}s</span>
            <span>TPS: {metrics.tps}</span>
            <span>Total Time: {metrics.elapsedTime}s</span>
            <span>Tokens: {metrics.totalTokens}</span>
            {metrics.cost && <span>Cost: ${metrics.cost}</span>}
          </div>
        )}
        <div className="mt-2 space-x-4">
            <button 
              onClick={() => navigateToTopic("About LatentSpace")} 
              className="hover:underline text-blue-600 dark:text-blue-400 bg-transparent border-none cursor-pointer"
            >
              About LatentSpace
            </button>
        </div>
      </footer>
    </div>
  )
}

export default App
