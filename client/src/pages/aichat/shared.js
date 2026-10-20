// Helpers shared by the AI chat screens (AiChatPage and its tabs).
export const errMsg = (e, d) => e?.response?.data?.error || d;

// The name a manager knows the fan by (demo mode replaces these with pseudonyms).
export const fanName = (f) => f?.display_name || f?.fan_nickname || (f?.fan_username ? `@${f.fan_username}` : 'A fan');

// What AI work cost, written so it can't be misread: "$0.10", "$1.40" from a
// cent up, and "0.05 cents" for a single reply.
export const cost = (dollars) => {
  const c = (Number(dollars) || 0) * 100;
  if (c >= 1) return `$${(c / 100).toFixed(2)}`;
  if (c <= 0) return '$0.00';
  return `${Number(c.toFixed(c < 0.1 ? 3 : 2))} cents`;
};
export const dollars = (n) => {
  const v = Number(n) || 0;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;   // $85, $85.50
};

export const dayTime = (iso) => (iso ? new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '');
export const shortDay = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '—');

// The kinds of notes kept about a fan, in the order they're shown.
export const KINDS = [
  ['about', 'About him'],
  ['likes', 'What he likes'],
  ['plan', 'Coming up for him'],
  ['avoid', 'Never bring up first'],
  ['promise', 'What she promised him'],
  ['her', 'What she told him about herself'],
];

// When he said something, in the words the AI uses: "today", "last week", "a few months ago".
export const agoText = (iso) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return 'a few days ago';
  if (d < 14) return 'last week';
  if (d < 30) return 'a few weeks ago';
  if (d < 60) return 'last month';
  if (d < 180) return 'a few months ago';
  return 'a long time ago';
};

// "Subscriber since 28 Jul · Spent $45 · 3 paid messages · 1 tip · last bought 2 Oct"
export const moneyLine = (m) => {
  if (!m) return '';
  const bits = [...(m.standing?.label ? [m.standing.label] : []), `Spent ${dollars(m.spent)}`];
  if (m.paid_messages) bits.push(`${m.paid_messages} paid message${m.paid_messages === 1 ? '' : 's'}`);
  if (m.tips) bits.push(`${m.tips} tip${m.tips === 1 ? '' : 's'}`);
  if (m.last_purchase) bits.push(`last bought ${shortDay(m.last_purchase)}`);
  return bits.join(' · ');
};
