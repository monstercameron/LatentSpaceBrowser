import { createContext, useContext } from 'react';

// How a page opens another: the app supplies the click handler and the address (which carries the lens).
const Navigation = createContext({
  navigate: () => {},
  hrefFor: (topic) => `?topic=${encodeURIComponent(topic)}`,
});

export const NavigationProvider = Navigation.Provider;
export const useNavigation = () => useContext(Navigation);

// Whether text arriving now should spawn word by word, and which block is the one being written.
const Reveal = createContext({ streaming: false, tailId: null });

export const RevealProvider = Reveal.Provider;
export const useReveal = () => useContext(Reveal);
