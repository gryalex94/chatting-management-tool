import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import api from '@/services/api';
import { usePlatform } from '@/context/PlatformContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PlatformNotice from '@/components/shared/PlatformNotice';
import PracticeTab from './PracticeTab';
import ProfileTab from './ProfileTab';
import MemoryTab from './MemoryTab';
import DuelTab from './DuelTab';
import { cost, errMsg } from './shared';

const Notice = ({ children }) => (
  <div className='flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm'>
    <CircleAlert className='mt-0.5 size-4 shrink-0 text-warn' /><span>{children}</span>
  </div>
);

/**
 * AI chat for the Fanvue AI creator (server/src/utils/aiChat.js). Step 1 is a
 * practice room: her profile, what she remembers about each fan, and replies
 * drafted by the AI and checked for safety. Nothing here is sent to Fanvue.
 */
export default function AiChatPage() {
  const { platform } = usePlatform();
  const [data, setData] = useState(null);             // { ready, writers, default_writer, pages }
  const [pageId, setPageId] = useState(null);
  const [tab, setTab] = useState('practice');
  const [spent, setSpent] = useState(null);

  const load = useCallback(() => api.get('/api/ai-chat').then(r => setData(r.data))
    .catch(e => setData({ error: errMsg(e, 'Could not load the AI chat'), status: e?.response?.status })), []);
  const loadSpent = useCallback(() => api.get('/api/ai-chat/usage').then(r => setSpent(r.data)).catch(() => setSpent(null)), []);
  useEffect(() => { load(); loadSpent(); }, [load, loadSpent]);

  const page = data?.pages?.find(p => p.creator_id === pageId) || data?.pages?.[0] || null;

  const header = (
    <div className='flex flex-wrap items-end justify-between gap-3'>
      <div className='min-w-0'>
        <h2 className='text-2xl font-bold tracking-tight'>AI chat</h2>
        <p className='max-w-3xl text-muted-foreground'>
          Her AI: who she is, what she remembers about each fan, and a practice room to try replies.
        </p>
      </div>
      <div className='flex flex-wrap items-center gap-3'>
        {spent && <span className='text-sm text-muted-foreground'>AI costs: today {cost(spent.today)} · last 30 days {cost(spent.days30)}</span>}
        {data?.pages?.length > 1 && (
          <Select value={page?.creator_id} onValueChange={setPageId}>
            <SelectTrigger className='w-56' aria-label='Fanvue page'><SelectValue /></SelectTrigger>
            <SelectContent>{data.pages.map(p => <SelectItem key={p.creator_id} value={p.creator_id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>
    </div>
  );

  if (platform !== 'fanvue') {
    return (
      <div className='flex flex-col gap-6'>
        {header}
        <PlatformNotice platform={platform} title='AI chat is for Fanvue pages'>Switch the menu at the top to Fanvue.</PlatformNotice>
      </div>
    );
  }
  if (!data) return <div className='flex flex-col gap-6'>{header}<div className='grid gap-3'>{[0, 1, 2].map(i => <Skeleton key={i} className='h-14 w-full' />)}</div></div>;
  if (data.error) return <div className='flex flex-col gap-6'>{header}<Notice>{data.status === 403 ? 'Only managers can use the AI chat.' : data.error}</Notice></div>;
  if (!page) return <div className='flex flex-col gap-6'>{header}<Notice>No Fanvue page yet: connect a Fanvue account in Settings → Fanvue first.</Notice></div>;

  return (
    <div className='flex flex-col gap-6'>
      {header}

      <div className='flex items-start gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm'>
        <ShieldCheck className='mt-0.5 size-4 shrink-0 text-good' />
        <span>Practice only: nothing here is sent to Fanvue. Every message from a fan passes a safety check before the AI sees it, and every reply is checked before you see it.</span>
      </div>
      {!data.ready.tables && <Notice>Run database change 036 (AI chat) in Supabase first.</Notice>}
      {data.ready.tables && !data.ready.writer && <Notice>The AI can&apos;t write yet: add OPENROUTER_API_KEY to the server&apos;s settings (Railway, and server/.env when running it on your computer).</Notice>}
      {data.ready.tables && !data.ready.checker && <Notice>Claude isn&apos;t connected (ANTHROPIC_API_KEY), so doubtful messages can&apos;t be checked.</Notice>}

      <Tabs value={tab} onValueChange={setTab} className='gap-4'>
        <div className='-mx-1 overflow-x-auto overflow-y-hidden px-1'>
          <TabsList>
            <TabsTrigger value='practice'>Practice</TabsTrigger>
            <TabsTrigger value='profile'>Her profile</TabsTrigger>
            <TabsTrigger value='memory'>Fan memory</TabsTrigger>
            <TabsTrigger value='duel'>Blind test</TabsTrigger>
          </TabsList>
        </div>
        {/* kept mounted, so a practice chat survives a look at the other tabs */}
        <TabsContent value='practice' forceMount className='data-[state=inactive]:hidden'>
          <PracticeTab key={page.creator_id} page={page} writers={data.writers} ready={data.ready} onSpent={loadSpent} onSetUp={() => setTab('profile')} />
        </TabsContent>
        <TabsContent value='profile'>
          <ProfileTab key={page.creator_id} page={page} writers={data.writers} ready={data.ready} onSaved={() => { load(); loadSpent(); }} />
        </TabsContent>
        <TabsContent value='memory'>
          <MemoryTab key={page.creator_id} page={page} ready={data.ready} onSpent={loadSpent} />
        </TabsContent>
        <TabsContent value='duel'>
          <DuelTab key={page.creator_id} page={page} ready={data.ready} onSpent={loadSpent} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
