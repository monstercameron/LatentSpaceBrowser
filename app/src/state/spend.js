import { useSyncExternalStore } from 'react';

// The cost of curiosity: what this tab has spent so far, in dollars. Kept for the life of the tab.
const KEY = 'latentspace_spend_v2';
const listeners = new Set();

const load = () => {
  try {
    const saved = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
};

let total = load();

export const getSpend = () => total;

export function addSpend(usd) {
  if (!(usd > 0)) return;
  total += usd;
  try {
    sessionStorage.setItem(KEY, String(total));
  } catch {
    // memory only
  }
  listeners.forEach((fn) => fn());
}

export const overBudget = (budget) => budget > 0 && total >= budget;

export const money = (usd) => `$${usd.toFixed(usd < 0.01 ? 4 : 3)}`;

export function useSpend() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSpend,
  );
}
