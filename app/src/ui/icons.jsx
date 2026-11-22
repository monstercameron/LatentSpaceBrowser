// Astryx ships a small set of semantic icons (search, chevrons, wrench...). These are the few more this app needs.
const make = (children) =>
  function GlyphIcon(props) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
        {children}
      </svg>
    );
  };

export const HomeIcon = make(<path d="M3 11.5 12 4l9 7.5M5.5 10v9h13v-9" />);

export const SunIcon = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);

export const MoonIcon = make(<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />);

// A branching path: the Trail.
export const TrailIcon = make(
  <>
    <circle cx="6" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="12" r="2" />
    <path d="M6 8v8M8 6c6 0 4 6 8 6M8 18c4 0 3-6 8-6" />
  </>,
);
