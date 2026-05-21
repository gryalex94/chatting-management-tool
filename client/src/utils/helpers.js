export function initials(name) {
  if (!name) return '??';
  return name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

export function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfff;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 38%), hsl(${(hue + 40) % 360} 55% 26%))`;
}

export function fmtTimer(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export const STATUS_META = {
  new:            { label: 'New',         color: 'var(--st-new)',         nameColor: '#f87171' },
  new_monitoring: { label: 'Monitoring',  color: 'var(--st-monitor)',     nameColor: '#fb923c' },
  developing:     { label: 'Developing',  color: 'var(--st-developing)',  nameColor: '#facc15' },
  experienced:    { label: 'Experienced', color: 'var(--st-experienced)', nameColor: '#4ade80' },
};

export const PRIORITY_COLORS = {
  1: 'var(--p1)', 2: 'var(--p2)', 3: 'var(--p3)', 4: 'var(--p4)',
  5: 'var(--p5)', 6: 'var(--p6)', 7: 'var(--p7)',
};
