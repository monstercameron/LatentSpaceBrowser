import { useState, useCallback, useEffect } from 'react';

export function useHistory(key = 'latent_browser_history') {
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.history || [];
      }
    } catch (e) {
      console.error("Failed to load history from local storage", e);
    }
    return [];
  });

  const [currentIndex, setCurrentIndex] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        return typeof parsed.currentIndex === 'number' ? parsed.currentIndex : -1;
      }
    } catch (e) {
      console.error("Failed to load history index from local storage", e);
    }
    return -1;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ history, currentIndex }));
    } catch (e) {
      console.error("Failed to save history to local storage", e);
    }
  }, [history, currentIndex, key]);

  const current = currentIndex >= 0 ? history[currentIndex] : null;
  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < history.length - 1;

  const push = useCallback((state) => {
    setHistory((prev) => {
      const newHistory = prev.slice(0, currentIndex + 1);
      return [...newHistory, state];
    });
    setCurrentIndex((prev) => prev + 1);
  }, [currentIndex]);

  const back = useCallback(() => {
    if (canGoBack) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [canGoBack]);

  const forward = useCallback(() => {
    if (canGoForward) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [canGoForward]);

  const clear = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
    localStorage.removeItem(key);
  }, [key]);

  return {
    current,
    push,
    back,
    forward,
    canGoBack,
    canGoForward,
    history,
    clear
  };
}
