import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// Small status label. `tone` picks the colour; every tone is built from tokens,
// so it reads in light and dark alike.
const TONES = {
  default: 'border-border bg-muted text-foreground',
  neutral: 'border-border bg-muted text-muted-foreground',
  indigo: 'border-link/30 bg-link/10 text-link',
  info: 'border-info/30 bg-info/10 text-info',
  good: 'border-good/30 bg-good/10 text-good',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  bad: 'border-bad/30 bg-bad/10 text-bad',
  purple: 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
};

export default function Chip({ tone = 'default', children, style, className }) {
  return (
    <Badge variant='outline' className={cn('rounded-md font-medium', TONES[tone] || TONES.default, className)} style={style}>
      {children}
    </Badge>
  );
}
