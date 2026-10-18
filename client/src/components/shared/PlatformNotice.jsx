import PlatformBadge from './PlatformBadge';

// Shown where a screen doesn't cover the platform picked in the menu (yet).
export default function PlatformNotice({ platform, title, children, action }) {
  return (
    <div className='mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 rounded-lg border bg-card p-6 text-center'>
      <PlatformBadge platform={platform} className='size-9 text-xs' />
      <p className='font-medium'>{title}</p>
      {children && <div className='text-sm text-muted-foreground'>{children}</div>}
      {action}
    </div>
  );
}

// Fansly, on every screen until it has pages.
export function FanslyNotice() {
  return (
    <PlatformNotice platform='fansly' title='No Fansly pages yet'>
      Fansly has no official connection. If your Fansly pages are in Infloww, they can come in the same way as OnlyFans.
      Add a Fansly page in Settings → Creators to start.
    </PlatformNotice>
  );
}
