import { cn } from '@/lib/utils';
import { platformInfo } from '@/utils/platforms';

// A small coloured square with the platform's initials (OF / FV / FS). Shown
// next to the platform's name, so it's hidden from screen readers.
export default function PlatformBadge({ platform, className }) {
  const p = platformInfo(platform);
  return (
    <span aria-hidden='true'
      className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold leading-none text-white', p.tone, className)}>
      {p.short}
    </span>
  );
}
