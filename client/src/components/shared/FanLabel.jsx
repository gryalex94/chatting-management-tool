import { Copy, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const copy = (t) => { try { navigator.clipboard?.writeText(t); toast.success(`Copied ${t}`); } catch { /* ignore */ } };

function CopyBit({ value, label, strong, tip }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type='button' onClick={() => copy(value)}
          className={cn('inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-accent',
            strong ? 'font-semibold text-foreground' : 'font-mono text-xs text-muted-foreground')}>
          {label}{strong && <Copy className='size-3 opacity-40' />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A fan, labelled the way Infloww shows them. Infloww's search accepts both the
 * name and the username (as "u123…", no "@"); each part copies on click.
 *  - name unique on the page (info.shared === 1) → **John** u51911219
 *  - name shared by several fans → **u51911219** John + "N fans on this page…"
 *  - unknown (no info) → username first, the name beside it (the safe default)
 * info = { name, shared } from the server (context.names / details.names).
 */
export default function FanLabel({ username, nickname, info, className }) {
  const name = info?.name || (nickname && nickname !== username ? nickname : null);
  const shared = info?.shared ?? null;
  if (!username && !name) return null;
  if (!username) return <span className={cn('inline-flex items-center', className)}><CopyBit value={name} label={name} strong tip='Copy name' /></span>;
  if (!name) return <span className={cn('inline-flex items-center', className)}><CopyBit value={username} label={username} strong tip='Copy username' /></span>;

  const nameFirst = shared === 1;
  return (
    <span className={cn('inline-flex items-center rounded-md border bg-background', className)}>
      {nameFirst ? (
        <>
          <CopyBit value={name} label={name} strong tip='Copy name (unique on this page)' />
          <CopyBit value={username} label={username} tip='Copy username' />
        </>
      ) : (
        <>
          <CopyBit value={username} label={username} strong tip='Copy username' />
          <CopyBit value={name} label={name} tip='Copy name' />
          {shared > 1 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className='inline-flex items-center gap-0.5 px-1 text-xs font-medium text-warn'><Users className='size-3' />{shared}</span>
              </TooltipTrigger>
              <TooltipContent>{shared} fans on this page are called “{name}”. Search by the username.</TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </span>
  );
}
