// Shared metadata for the review-task system (used by Home + Tasks pages).

export const TIER = {
  1: { label: 'P1', name: 'Critical / safety', c: '#ef4444' },
  2: { label: 'P2', name: 'Work ethic', c: '#f97316' },
  3: { label: 'P3', name: 'Lost money', c: '#f59e0b' },
  4: { label: 'P4', name: 'Communication', c: '#3b82f6' },
  5: { label: 'P5', name: 'Sales craft', c: '#8b5cf6' },
  6: { label: 'P6', name: 'Page health', c: '#8888a0' },
  7: { label: 'P7', name: 'Polish', c: '#5a5a70' },
};
export const TIERS = [1, 2, 3, 4, 5, 6, 7];

export const DISMISS_REASONS = [
  { key: 'allowed', label: 'This is allowed' },
  { key: 'needs_context', label: 'Needs the full dialogue' },
  { key: 'misread', label: 'AI misread it' },
  { key: 'too_minor', label: 'Too minor to action' },
  { key: 'fan_fault', label: "Fan's behaviour, not the chatter" },
  { key: 'other', label: 'Other…' },
];
export const reasonLabel = Object.fromEntries(DISMISS_REASONS.map(r => [r.key, r.label]));

import { getInflowwOffset } from './displaySettings';

// Format a stored message timestamp (ISO) as "28 Jun 2026, 02:24", plus the manual
// Infloww offset (hours) so task times line up with the chat screen. Day rollover is
// handled (e.g. 23:30 +1h → next day 00:30). The offset defaults to the org setting.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtSentAt(iso, offsetHours) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const off = offsetHours == null ? getInflowwOffset() : Number(offsetHours) || 0;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + off, +m[5]));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
