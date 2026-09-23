import { cn } from '@/lib/utils';

const COLORS = {
  1: 'bg-red-500', 2: 'bg-orange-500', 3: 'bg-amber-500', 4: 'bg-blue-500',
  5: 'bg-violet-500', 6: 'bg-zinc-400', 7: 'bg-zinc-500',
};

export default function PriorityDot({ p }) {
  return (
    <span title={`P${p}`}
      className={cn('relative size-[9px] shrink-0 rounded-full after:absolute after:-inset-[3px] after:rounded-full after:bg-inherit after:opacity-25', COLORS[p] || COLORS[7])} />
  );
}
