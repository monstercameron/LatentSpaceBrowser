import { languageKey } from '../state/topics.js';
import { a11yDigest } from '../engine/a11y.js';
import { expandCompact } from '../engine/compact.js';
import { summarize, writeA11y, writeByFormat, writeJourney } from '../engine/pipeline.js';
import { surfaceFrom } from '../a2ui/surface.js';
import { htmlToSurface } from './htmlSurface.js';

/**
 * Writes one page, every pass it needs: the page (and its links, on the A2UI path), then, if the reader
 * turned it on, the accessibility pass. It lives here and not in the engine because an HTML page has to be
 * converted to a surface (which needs the DOM) before the model can read it.
 *
 * The accessibility pass can only add: if it fails the page is still whole, and says so.
 */
export async function runPage({ node, settings, onEvent }) {
  const written = await write({ node, settings, onEvent });
  return { ...written, langKey: languageKey(settings) }; // the language it was written in; translations sit beside it
}

async function write({ node, settings, onEvent }) {
  const page =
    node.kind === 'retro'
      ? await writeJourney({ stops: node.stops, settings, onEvent })
      : await writeByFormat({ topic: node.topic, lens: node.lens, about: node.about, settings, onEvent });
  if (!settings.a11y) return page;

  try {
    // The page is already on screen; this tells the reader what is happening while the pass runs.
    onEvent?.({ stage: 'a11y', text: page.compact ?? page.html, format: page.format });
    const surface = page.format === 'html' ? htmlToSurface(page.html) : surfaceFrom(expandCompact(page.compact).messages);
    const { a11y, pass } = await writeA11y({ digest: a11yDigest(surface), settings });
    return { ...page, a11y, metrics: summarize([...page.metrics.passes, pass]) };
  } catch (error) {
    return { ...page, a11yError: error.message };
  }
}
