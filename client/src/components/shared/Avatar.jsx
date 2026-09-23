import { cn } from '@/lib/utils';
import { initials, avatarColor } from '@/utils/helpers';

// Initials on a colour picked from the name. Size and colour are data-driven,
// so they stay inline; everything else is tokens.
export default function Avatar({ name, size = 28, style = {}, className }) {
  return (
    <span
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full border border-black/10 font-semibold text-white dark:border-white/10', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: avatarColor(name), ...style }}
    >
      {initials(name)}
    </span>
  );
}
