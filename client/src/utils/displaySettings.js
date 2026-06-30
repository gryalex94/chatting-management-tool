// Manual offset (in hours) added to message timestamps so task times line up with
// what the manager sees in Infloww's chat screen. Infloww's export and its chat UI
// can differ (e.g. by 1h during daylight saving), so this is set by hand in Settings.
// Cached in localStorage so the formatter can read it synchronously on first paint.

let inflowwOffsetHours = 0;
try { inflowwOffsetHours = Number(localStorage.getItem('inflowwOffsetHours')) || 0; } catch { /* SSR / blocked */ }

export const getInflowwOffset = () => inflowwOffsetHours;

export const setInflowwOffset = (h) => {
  inflowwOffsetHours = Number(h) || 0;
  try { localStorage.setItem('inflowwOffsetHours', String(inflowwOffsetHours)); } catch { /* ignore */ }
};
