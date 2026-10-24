import { useState } from 'react';
import { ArrowRight, Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// days are 'YYYY-MM-DD' strings on the Amsterdam calendar
const TZ = 'Europe/Amsterdam';
const amsToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monthEnd = (ym) => addDays(`${addMonths(ym, 1)}-01`, -1);
function addMonths(ym, n) { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }
const long = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthName = (ym, opts = { month: 'long' }) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

/** The quick picks on the left: rolling windows, this year, its months, then the years before. */
function presets(today = amsToday()) {
  const year = today.slice(0, 4), out = [
    { key: '7', label: 'Last 7 days', from: addDays(today, -6), to: today },
    { key: '30', label: 'Last 30 days', from: addDays(today, -29), to: today },
    { key: '90', label: 'Last 90 days', from: addDays(today, -89), to: today },
    { key: '365', label: 'Last 365 days', from: addDays(today, -364), to: today },
    { key: year, label: year, from: `${year}-01-01`, to: today },
  ];
  for (let ym = today.slice(0, 7); ym.startsWith(year); ym = addMonths(ym, -1)) {
    out.push({ key: ym, label: monthName(ym), from: `${ym}-01`, to: ym === today.slice(0, 7) ? today : monthEnd(ym) });
  }
  for (let y = Number(year) - 1; y >= Number(year) - 2; y--) out.push({ key: String(y), label: String(y), from: `${y}-01-01`, to: `${y}-12-31` });
  return out;
}

/**
 * A date range like Infloww's: the range on the button; quick picks on the left,
 * two months on the right. Click a first day and a last day; days after today
 * can't be picked.
 */
export default function DateRangePicker({ value, onChange, className }) {
  const today = amsToday();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);       // the first day clicked, waiting for the second
  const [hover, setHover] = useState(null);
  const [left, setLeft] = useState(() => addMonths(value.to.slice(0, 7), -1));
  const list = presets(today);
  const active = list.find(p => p.from === value.from && p.to === value.to)?.key || 'custom';

  const pick = (from, to) => { onChange({ from, to }); setAnchor(null); setOpen(false); };
  const click = (d) => {
    if (!anchor) { setAnchor(d); return; }
    pick(d < anchor ? d : anchor, d < anchor ? anchor : d);
  };
  const [lo, hi] = anchor ? [anchor < (hover || anchor) ? anchor : hover, anchor < (hover || anchor) ? hover || anchor : anchor] : [value.from, value.to];
  const openChange = (v) => { setOpen(v); setAnchor(null); if (v) setLeft(addMonths(value.to.slice(0, 7), -1)); };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button type='button' className={cn('inline-flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-muted', className)}>
          <Calendar className='size-3.5 text-muted-foreground' />
          <span className='tabular-nums'>{long(value.from)}</span>
          <ArrowRight className='size-3.5 text-muted-foreground' />
          <span className='tabular-nums'>{long(value.to)}</span>
          <ChevronDown className='size-3.5 text-muted-foreground' />
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' className='flex w-auto gap-0 p-0'>
        <div className='max-h-80 w-44 overflow-y-auto border-r py-1'>
          <button type='button' onClick={() => setAnchor(null)} className={cn('block w-full px-4 py-1.5 text-left text-sm hover:bg-muted', active === 'custom' && 'font-medium text-orange-500')}>Custom</button>
          {list.map(p => (
            <button key={p.key} type='button' onClick={() => pick(p.from, p.to)}
              className={cn('block w-full px-4 py-1.5 text-left text-sm hover:bg-muted', active === p.key && 'font-medium text-orange-500')}>{p.label}</button>
          ))}
        </div>
        <div className='flex gap-4 p-3' onMouseLeave={() => setHover(null)}>
          {[left, addMonths(left, 1)].map((ym, i) => (
            <Month key={ym} ym={ym} today={today} lo={lo} hi={hi} anchor={anchor} onClick={click} onHover={setHover}
              nav={i === 0
                ? <><Nav onClick={() => setLeft(addMonths(left, -12))} label='A year back'><ChevronsLeft className='size-3.5' /></Nav><Nav onClick={() => setLeft(addMonths(left, -1))} label='A month back'><ChevronLeft className='size-3.5' /></Nav></>
                : <><Nav onClick={() => setLeft(addMonths(left, 1))} label='A month ahead'><ChevronRight className='size-3.5' /></Nav><Nav onClick={() => setLeft(addMonths(left, 12))} label='A year ahead'><ChevronsRight className='size-3.5' /></Nav></>}
              navSide={i === 0 ? 'left' : 'right'} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Nav({ onClick, label, children }) {
  return <button type='button' aria-label={label} onClick={onClick} className='rounded border p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground'>{children}</button>;
}

function Month({ ym, today, lo, hi, anchor, onClick, onHover, nav, navSide }) {
  const first = `${ym}-01`;
  const start = addDays(first, -new Date(`${first}T12:00:00Z`).getUTCDay());   // weeks start on Sunday
  const cells = Array.from({ length: 42 }, (_, k) => addDays(start, k));
  return (
    <div className='w-64'>
      <div className='mb-2 flex h-6 items-center justify-between'>
        {navSide === 'left' ? <div className='flex gap-1'>{nav}</div> : <span />}
        <span className='text-sm font-medium'>{monthName(ym, { month: 'short', year: 'numeric' })}</span>
        {navSide === 'right' ? <div className='flex gap-1'>{nav}</div> : <span />}
      </div>
      <div className='grid grid-cols-7 text-center text-xs'>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <span key={d} className='py-1 text-muted-foreground'>{d}</span>)}
        {cells.map(d => {
          const out = !d.startsWith(ym), future = d > today, edge = d === lo || d === hi, inside = lo && hi && d > lo && d < hi;
          return (
            <button key={d} type='button' disabled={future} onClick={() => onClick(d)} onMouseEnter={() => anchor && !future && onHover(d)}
              className={cn('h-8 tabular-nums', out ? 'text-muted-foreground/40' : '', future && 'cursor-not-allowed text-muted-foreground/30',
                !out && inside && 'bg-orange-500/25', !out && edge && 'rounded-md bg-orange-500 font-medium text-white',
                !out && !edge && !future && 'rounded-md hover:bg-muted', d === today && !edge && 'rounded-md ring-1 ring-orange-500 ring-inset')}>
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
