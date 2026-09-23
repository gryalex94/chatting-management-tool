import { cn } from '@/lib/utils';

// Chatter experience stage: new → monitoring → developing → experienced.
const COLORS = {
  new: 'bg-red-500 ring-red-500/20',
  monitor: 'bg-orange-500 ring-orange-500/20',
  developing: 'bg-yellow-500 ring-yellow-500/20',
  experienced: 'bg-green-500 ring-green-500/20',
};

export default function StatusDot({ status, className }) {
  const s = status === 'new_monitoring' ? 'monitor' : status;
  return <span className={cn('inline-block size-2 shrink-0 rounded-full ring-3', COLORS[s] || 'bg-muted-foreground ring-muted-foreground/20', className)} />;
}
