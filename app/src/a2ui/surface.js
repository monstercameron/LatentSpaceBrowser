// An A2UI surface: the messages the page was described in, folded into a flat component table.
// Components refer to each other by id; "root" is where rendering starts.
// Only the message kinds this app uses are handled: createSurface, updateComponents, deleteSurface.

export const emptySurface = () => ({ id: null, catalogId: null, components: {} });

export function applyMessage(surface, message) {
  if (message.createSurface) {
    return { id: message.createSurface.surfaceId, catalogId: message.createSurface.catalogId ?? null, components: {} };
  }
  if (message.updateComponents) {
    const { surfaceId, components = [] } = message.updateComponents;
    if (surface.id !== surfaceId) return surface; // an update for a surface that was never created
    const next = { ...surface.components };
    for (const component of components) if (component?.id) next[component.id] = component;
    return { ...surface, components: next };
  }
  if (message.deleteSurface?.surfaceId === surface.id) return emptySurface();
  return surface;
}

export const surfaceFrom = (messages) => messages.reduce(applyMessage, emptySurface());

/** The components under `id`, in order, skipping ids that have not arrived (a half-streamed page). */
export const childrenOf = (surface, id) =>
  (surface.components[id]?.children ?? []).filter((childId) => surface.components[childId]);

/** The section (2) and sub-section (3) headings, in reading order, for the contents list. */
export function headingsOf(surface) {
  return childrenOf(surface, 'root')
    .map((id) => surface.components[id])
    .filter((c) => c.component === 'Heading' && (c.level === 2 || c.level === 3))
    .map((c) => ({ id: c.id, text: c.text, level: c.level }));
}
