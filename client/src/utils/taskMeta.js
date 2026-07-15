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

// Human labels + colors for every issue "area" the AI/engine can emit. Colors are
// grouped by family: red = ToS/safety, orange = money-owed/work-ethic, amber =
// sales, blue = communication, purple = quality, green = opportunity, grey = page
// health. Keep in sync with the area vocab in the server eval prompts.
export const AREA_META = {
  // ToS / safety (protected)
  tos:          { label: 'ToS',            c: '#ef4444' },
  age:          { label: 'Age',            c: '#ef4444' },
  meeting:      { label: 'Meeting',        c: '#ef4444' },
  free_content: { label: 'Free content',   c: '#ef4444' },
  offplatform:  { label: 'Off-platform',   c: '#ef4444' },
  chargeback:   { label: 'Chargeback',     c: '#ef4444' },
  // money owed / work ethic
  custom:       { label: 'Custom pending', c: '#f97316' },
  abandon:      { label: 'Left early',     c: '#f97316' },
  work_ethic:   { label: 'Work ethic',     c: '#f97316' },
  discount:     { label: 'Discount',       c: '#f97316' },
  // sales
  sales:        { label: 'Sales',          c: '#f59e0b' },
  budget:       { label: 'Budget',         c: '#f59e0b' },
  // communication / quality
  communication:{ label: 'Communication',  c: '#3b82f6' },
  quality:      { label: 'Quality',        c: '#8b5cf6' },
  swearing:     { label: 'Swearing',       c: '#8b5cf6' },
  excessive:    { label: 'Too explicit',   c: '#ec4899' },
  // opportunity
  gift:         { label: 'Gift',           c: '#10b981' },
  // page health / data
  revenue:      { label: 'Revenue',        c: '#8888a0' },
  ratio:        { label: 'Ratio',          c: '#8888a0' },
  ltv:          { label: 'LTV',            c: '#8888a0' },
  churn:        { label: 'Churn',          c: '#8888a0' },
  spenders:     { label: 'Spenders',       c: '#8888a0' },
  data:         { label: 'Data',           c: '#8888a0' },
};
// Resolve an area to its {label, c}. Unknown areas fall back to a titlecased
// version of the raw key so nothing ever renders as an ugly snake_case token.
export function areaMeta(area) {
  const key = String(area || '').toLowerCase();
  if (AREA_META[key]) return AREA_META[key];
  const label = key ? key.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : '';
  return { label, c: '#8888a0' };
}
export const areaLabel = (area) => areaMeta(area).label;

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
