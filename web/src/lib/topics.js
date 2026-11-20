// A topic is a path through the latent space: "Lighthouse > Navigation > Compass".
// The model only ever writes the link text; the app keeps track of the path.

export const SEP = ' > ';
const MAX_DEPTH = 4;

export const parts = (topic) =>
  String(topic ?? '').split(/\s+>\s+/).map((s) => s.trim()).filter(Boolean);

export const leaf = (topic) => parts(topic).at(-1) ?? '';

export const trail = (topic) => parts(topic).slice(0, -1);

/** The topic reached by following a link called `next` from the page `from`. */
export const child = (from, next) =>
  [...parts(from), ...parts(next)].slice(-MAX_DEPTH).join(SEP);
