// Throwaway probe: can Astryx render a LatentSpace page inside this Vite + Tailwind 3 setup?
// Open /astryx-probe.html, or /astryx-probe.html?tailwind=1 to load the app's Tailwind CSS too.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { Markdown } from '@astryxdesign/core/Markdown';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import './layers.css'; // first: declares the layer order
import './probe.css';

// A compact page as the model writes it, after the link pass: **bold** subject and [[Topic]] links.
const PAGE = `**Basalt** is a fine-grained [[volcanic rock]] that forms when [[lava]] cools quickly at the surface. It is the most common rock of the [[oceanic crust]].

## Formation

Basaltic magma originates from partial melting of the [[upper mantle]], often at [[divergent plate boundaries]]. Its low silica content gives it a low viscosity, so it flows great distances.

## Uses

Crushed basalt is used as [[road base]] and as an ingredient in [[composite materials]].`;

// The link pass's [[Topic]] markup becomes a real link to the next page, in one small plugin.
// Markdown's onLinkClick does not cover links a plugin renders, so each one handles its own click.
// A plain click stays in the app; a modified click (open in new tab) keeps the real href.
const plain = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
const makeTopicLinks = (onNavigate) => [
  {
    pattern: /\[\[([^\]]+)\]\]/g,
    requiredSubstrings: ['[['],
    render: (match, key) => (
      <Link
        key={key}
        hasUnderline
        href={`?topic=${encodeURIComponent(match[1])}`}
        onClick={(e) => {
          if (!plain(e)) return;
          e.preventDefault();
          onNavigate(match[1]);
        }}
      >
        {match[1]}
      </Link>
    ),
  },
];

function Probe() {
  const [mode, setMode] = useState('light');
  const [clicked, setClicked] = useState('');
  return (
    <Theme theme={neutralTheme} mode={mode}>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
        <Button
          label={mode === 'light' ? 'Switch to dark' : 'Switch to light'}
          onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        />
        <Heading level={1}>Basalt</Heading>
        <MetadataList>
          <MetadataListItem label="Type">Extrusive igneous rock</MetadataListItem>
          <MetadataListItem label="Primary minerals">Plagioclase feldspar, pyroxene, olivine</MetadataListItem>
          <MetadataListItem label="Density">2.9 to 3.0 g/cm³</MetadataListItem>
        </MetadataList>
        <Markdown inlinePlugins={makeTopicLinks(setClicked)} headingLevelStart={2}>
          {PAGE}
        </Markdown>
        <p id="clicked">{clicked ? `navigate to: ${clicked}` : 'no link clicked yet'}</p>
        {/* A Tailwind utility on an Astryx component: it must win over the component's own style. */}
        <Button label="Utility test" className="bg-red-600 text-white" />
        <div id="tw-utility" className="mt-2 rounded-lg bg-amber-200 p-3 text-sm">Tailwind utilities still style plain elements.</div>
      </main>
    </Theme>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Probe />
  </StrictMode>,
);
