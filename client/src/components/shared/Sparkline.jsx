import { cn } from '@/lib/utils';

// Tiny bar chart. Bar heights are data, so they stay inline.
const TONES = { indigo: 'bg-link', good: 'bg-good' };

export default function Sparkline({ data = [], height = 22, tone = 'indigo' }) {
  const max = Math.max(...data, 1);
  return (
    <span className='inline-flex items-end gap-0.5' style={{ height }}>
      {data.map((v, i) => (
        <i key={i} className={cn('block w-[3px] rounded-[1px]', TONES[tone] || TONES.indigo)} style={{ height: `${(v / max) * 100}%` }} />
      ))}
    </span>
  );
}
