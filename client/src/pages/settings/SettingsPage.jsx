import { useState, useEffect, useCallback } from 'react';
import {
  ChevronRight, Clock, Copy, MoreHorizontal, Pencil, Plus, Trash2, UserCheck, UserX, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { Avatar, Chip, StatusDot } from '@/components/shared';
import { STATUS_META } from '@/utils/helpers';
import { setInflowwOffset, getInflowwOffset } from '@/utils/displaySettings';
import { fmtSentAt } from '@/utils/taskMeta';
import { cn } from '@/lib/utils';
import CreatorDetailModal from './CreatorDetailModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/* ─── Role rules (mirror server/src/utils/roles.js — the server enforces them) ── */

const ROLE_RANK = { chatter: 0, va: 1, manager: 2, head_manager: 3, admin: 4, owner: 5 };
// Which roles each role may give out, by invite, direct creation or a role change.
// Nobody can grant owner, and only the owner can create admins.
const ASSIGNABLE = {
  owner: ['admin', 'head_manager', 'manager', 'chatter', 'va'],
  admin: ['head_manager', 'manager', 'chatter', 'va'],
};
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', head_manager: 'Head manager', manager: 'Manager', chatter: 'Chatter', va: 'VA' };
const ROLE_DOT = {
  owner: 'bg-indigo-500', admin: 'bg-violet-500', head_manager: 'bg-blue-500',
  manager: 'bg-green-500', chatter: 'bg-amber-500', va: 'bg-zinc-400',
};
const roleLabel = (r) => ROLE_LABEL[r] || (r || '').replace('_', ' ');
// Only someone strictly above the target can change them — never yourself or the owner.
const canManage = (me, m) => !!me && m.id !== me.id && m.role !== 'owner'
  && (ROLE_RANK[me.role] ?? -1) > (ROLE_RANK[m.role] ?? 99);

const EMOJIS = ['📝','✅','🔍','📋','💬','🎤','🧑‍💼','📤','🐋','📊','⚠️','🔥','📞','📅','🎯','💰','📸','🛠️','📌','💡','🚀','👀','🔔','⏰','📦','🏆','❌','✏️','🤝','📈','🧹','💳'];
const EMPTY_TEMPLATE = { label:'', icon:'📝', title:'', description:'', priority:3 };

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString([], { day:'numeric', month:'short', year:'numeric' }) : '';

/* ─── Building blocks ─────────────────────────────────────────────────────── */

function Section({ title, sub, right, children }) {
  return (
    <section className='overflow-hidden rounded-lg border bg-card'>
      <div className='flex flex-wrap items-center gap-2 border-b px-4 py-3'>
        <div className='min-w-0'>
          <h3 className='font-semibold'>{title}</h3>
          {sub && <p className='text-sm text-muted-foreground'>{sub}</p>}
        </div>
        {right && <div className='ms-auto'>{right}</div>}
      </div>
      <div className='grid gap-4 p-4'>{children}</div>
    </section>
  );
}

function Empty({ children }) {
  return <div className='rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground'>{children}</div>;
}

function FormHeading({ children }) {
  return <h4 className='text-sm font-medium'>{children}</h4>;
}

function RoleBadge({ role }) {
  return (
    <Badge variant='outline' className='gap-1.5 font-normal'>
      <span className={cn('size-1.5 rounded-full', ROLE_DOT[role] || 'bg-zinc-400')} />{roleLabel(role)}
    </Badge>
  );
}

function RoleSelect({ value, onChange, roles, id }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className='w-full'><SelectValue /></SelectTrigger>
      <SelectContent>{roles.map(r => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function SettingsPage() {
  const { user, isAdmin } = useAuth();
  const [members, setMembers] = useState([]);
  const [creators, setCreators] = useState([]);
  const [chatters, setChatters] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [creatorName, setCreatorName] = useState('');
  const [chatterForm, setChatterForm] = useState({ name:'', email:'' });
  const [inviteForm, setInviteForm] = useState({ email:'', role:'chatter' });
  const [memberForm, setMemberForm] = useState({ name:'', email:'', password:'', role:'chatter' });
  const [inviteToken, setInviteToken] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [shiftForm, setShiftForm] = useState({ name:'', start_time:'', end_time:'' });
  const [templates, setTemplates] = useState([]);
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [tab, setTab] = useState('creators');
  const [creatorDetail, setCreatorDetail] = useState(null);
  const [tzOffset, setTzOffset] = useState(getInflowwOffset());
  const [savingTz, setSavingTz] = useState(false);
  // One confirm dialog for every destructive action: { title, description, action, run }
  const [confirm, setConfirm] = useState(null);

  const assignable = ASSIGNABLE[user?.role] || [];

  const load = useCallback(async()=>{
    try {
      const [m,cr,ch,sh,tp,cfg]=await Promise.all([
        api.get('/api/organisations/members'), api.get('/api/creators'),
        api.get('/api/chatters'), api.get('/api/shifts'),
        api.get('/api/tasks/templates').catch(()=>({data:[]})),
        api.get('/api/organisations/config').catch(()=>({data:{config:{}}})),
      ]);
      setMembers(m.data); setCreators(cr.data); setChatters(ch.data); setShifts(sh.data); setTemplates(tp.data);
      const off = Number(cfg.data?.config?.infloww_offset_hours) || 0;
      setTzOffset(off); setInflowwOffset(off);
    } catch(e){console.error(e?.message || e?.toString?.());}
    finally{setLoading(false);}
  },[]);

  // Pending invitations are admin-only on the server.
  const loadInvitations = useCallback(async()=>{
    if (!isAdmin) return;
    try { const { data } = await api.get('/api/organisations/invitations'); setInvitations(data || []); }
    catch { /* list is optional */ }
  },[isAdmin]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{load();},[load]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{loadInvitations();},[loadInvitations]);

  async function saveTzOffset(val) {
    setSavingTz(true);
    try {
      await api.put('/api/organisations/config', { key:'infloww_offset_hours', value:String(val) });
      setInflowwOffset(val);
      toast.success('Time alignment saved');
    } catch { toast.error('Failed to save'); }
    finally { setSavingTz(false); }
  }

  async function addCreator(e) {
    e.preventDefault(); if(!creatorName.trim()) return;
    try { await api.post('/api/creators',{name:creatorName}); toast.success('Creator added'); setCreatorName(''); load(); }
    catch { toast.error('Failed'); }
  }

  async function addChatter(e) {
    e.preventDefault(); if(!chatterForm.name.trim()) return;
    try { await api.post('/api/chatters',chatterForm); toast.success('Chatter added'); setChatterForm({name:'',email:''}); load(); }
    catch { toast.error('Failed'); }
  }

  async function sendInvite(e) {
    e.preventDefault();
    try { const {data}=await api.post('/api/auth/invite',inviteForm); setInviteToken(data.invitation.token); toast.success('Invite created'); setInviteForm({email:'',role:'chatter'}); loadInvitations(); }
    catch(err) { toast.error(err.response?.data?.error||'Failed'); }
  }

  async function createMember(e) {
    e.preventDefault();
    try {
      await api.post('/api/auth/create-member', memberForm);
      toast.success(`${memberForm.name} created! They can log in with the password you set.`);
      setMemberForm({name:'',email:'',password:'',role:'chatter'});
      load();
    } catch(err) { toast.error(err.response?.data?.error||'Failed'); }
  }

  async function addShift(e) {
    e.preventDefault(); if(!shiftForm.name||!shiftForm.start_time||!shiftForm.end_time) return;
    try { await api.post('/api/shifts',shiftForm); toast.success('Shift added'); setShiftForm({name:'',start_time:'',end_time:''}); load(); }
    catch { toast.error('Failed'); }
  }

  async function updateChatterStatus(id, status) {
    try { await api.put(`/api/chatters/${id}`,{status}); toast.success('Updated'); load(); }
    catch { toast.error('Failed'); }
  }

  async function deactivateChatter(ch) {
    try { await api.put(`/api/chatters/${ch.id}`,{is_active:false}); toast.success('Deactivated'); load(); }
    catch { toast.error('Failed'); }
  }

  // Staff management: role change and deactivate / reactivate (admin+).
  async function updateMember(m, body, okMsg) {
    try {
      const { data } = await api.patch(`/api/organisations/members/${m.id}`, body);
      if (data?.id) setMembers(ms => ms.map(x => x.id === data.id ? { ...x, ...data } : x));
      toast.success(okMsg);
    } catch(err) { toast.error(err.response?.data?.error||'Failed'); }
  }

  async function revokeInvite(inv) {
    try {
      await api.delete(`/api/organisations/invitations/${inv.id}`);
      setInvitations(list => list.filter(i => i.id !== inv.id));
      toast.success('Invitation revoked');
    } catch(err) { toast.error(err.response?.data?.error||'Failed'); }
  }

  async function saveTemplate(e) {
    e.preventDefault();
    if(!templateForm.label||!templateForm.title) return toast.error('Label and title required');
    try{
      if(editingTemplateId){
        await api.put(`/api/tasks/templates/${editingTemplateId}`,templateForm);
        toast.success('Template updated');
        setEditingTemplateId(null);
      } else {
        await api.post('/api/tasks/templates',templateForm);
        toast.success('Template added');
      }
      setTemplateForm(EMPTY_TEMPLATE);load();
    } catch{toast.error('Failed');}
  }

  async function removeTemplate(t) {
    try{await api.delete(`/api/tasks/templates/${t.id}`);toast.success('Removed');load();}
    catch{toast.error('Failed');}
  }

  async function startCycle() {
    try{await api.post('/api/cycles/start');toast.success('Cycle started');load();}catch{toast.error('Failed');}
  }

  async function closeWeek() {
    try{
      const{data:active}=await api.get('/api/cycles/active');
      if(!active) return toast.error('No active cycle');
      await api.post(`/api/cycles/${active.id}/close`);
      toast.success('Week closed! Tasks rolled over.');load();
    }catch{toast.error('Failed');}
  }

  // The person opens this link to choose a name and password (pages/auth/AcceptInvitePage).
  const inviteLink = inviteToken ? `${window.location.origin}/invite/${inviteToken}` : '';
  const copyToken = () => { try { navigator.clipboard?.writeText(inviteLink); toast.success('Invite link copied'); } catch { /* ignore */ } };

  const tabs = [['creators','Creators'],['chatters','Chatters'],['team','Team'],['shifts','Shifts'],['templates','Templates'],['cycles','Cycles']];

  if(loading) return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div className='space-y-2'><Skeleton className='h-8 w-40' /><Skeleton className='h-4 w-56' /></div>
      <div className='grid gap-4 sm:grid-cols-2'><Skeleton className='h-20' /><Skeleton className='h-20' /></div>
      <Skeleton className='h-28' />
      <Skeleton className='h-9 w-full max-w-md' />
      <Skeleton className='h-64' />
    </div>
  );

  return (
    <div className='flex max-w-4xl flex-col gap-4 pb-20 sm:gap-6'>
      <div>
        <h2 className='text-2xl font-bold tracking-tight'>Settings</h2>
        <p className='text-muted-foreground'>Manage your organisation</p>
      </div>

      {/* Org info */}
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='rounded-lg border bg-card p-4'>
          <p className='text-sm text-muted-foreground'>Organisation</p>
          <p className='mt-1 text-lg font-semibold'>{user?.organisation?.name}</p>
        </div>
        <div className='rounded-lg border bg-card p-4'>
          <p className='text-sm text-muted-foreground'>Stats</p>
          <p className='mt-1.5 text-sm tabular-nums'>{members.length} members · {creators.length} creators · {chatters.length} chatters</p>
        </div>
      </div>

      {/* Infloww time alignment */}
      <div className='rounded-lg border bg-card p-4'>
        <div className='flex items-center gap-2'>
          <Clock className='size-4 text-muted-foreground' />
          <h3 className='font-semibold'>Infloww time alignment</h3>
        </div>
        <p className='mt-1 text-sm text-muted-foreground'>
          If task timestamps don't match your Infloww chat screen, set the hour offset to align them (e.g. <span className='font-medium text-foreground'>+1</span> during summer time). Applies everywhere times are shown.
        </p>
        <div className='mt-3 flex flex-wrap items-center gap-3'>
          <div className='flex items-center gap-2'>
            <Label htmlFor='tz-offset' className='sr-only'>Hour offset</Label>
            <Input id='tz-offset' type='number' min={-14} max={14} step={1} value={tzOffset} disabled={!isAdmin}
              onChange={e=>setTzOffset(Number(e.target.value)||0)} className='w-20 tabular-nums' />
            <span className='text-sm text-muted-foreground'>hours</span>
          </div>
          <span className='text-sm text-muted-foreground'>Preview: <span className='font-medium text-link tabular-nums'>{fmtSentAt('2026-06-28T04:20:00+00:00', tzOffset)}</span></span>
          {isAdmin&&<Button size='sm' disabled={savingTz||tzOffset===getInflowwOffset()} onClick={()=>saveTzOffset(tzOffset)}>{savingTz?'Saving…':'Save'}</Button>}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className='gap-4'>
        <div className='-mx-1 overflow-x-auto px-1'>
          <TabsList>
            {tabs.map(([k,l])=><TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}
          </TabsList>
        </div>

        {/* Creators */}
        <TabsContent value='creators'>
          <Section title='Creators' sub={`${creators.length} pages — click one to edit its name, AI context and removal`}
            right={isAdmin&&<span className='text-xs text-muted-foreground'>Admin only</span>}>
            {creators.length === 0 ? <Empty>No creators yet.</Empty> : (
              <div className='grid gap-1.5'>
                {creators.map(c=>{
                  const hasCtx = !!(c.ai_context || c.ai_instructions);
                  return (
                    <button key={c.id} type='button' onClick={()=>setCreatorDetail(c)}
                      className='flex w-full items-center gap-3 rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-accent'>
                      <Avatar name={c.name} size={28}/>
                      <span className='min-w-0 flex-1 truncate text-sm font-medium'>{c.name}</span>
                      {hasCtx
                        ? <Chip tone='good'>AI context set</Chip>
                        : <span className='text-xs text-muted-foreground'>No AI context</span>}
                      <ChevronRight className='size-4 text-muted-foreground' />
                    </button>
                  );
                })}
              </div>
            )}
            {isAdmin&&<form onSubmit={addCreator} className='flex gap-2'>
              <Input value={creatorName} onChange={e=>setCreatorName(e.target.value)} placeholder='Creator name' aria-label='Creator name' className='flex-1'/>
              <Button type='submit'><Plus/>Add</Button>
            </form>}
          </Section>
        </TabsContent>

        {/* Chatters */}
        <TabsContent value='chatters'>
          <Section title='Chatters' sub={`${chatters.length} chatters in your org`}>
            {chatters.length === 0 ? <Empty>No chatters yet.</Empty> : (
              <div className='grid gap-1.5'>
                {chatters.map(ch=>(
                  <div key={ch.id} className='flex items-center gap-3 rounded-md border bg-background px-3 py-2'>
                    <Avatar name={ch.name} size={28}/>
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-sm font-medium'>{ch.name}</p>
                      <p className='truncate text-xs text-muted-foreground'>{ch.email||'No email'}</p>
                    </div>
                    <div className='flex items-center gap-0.5' role='group' aria-label='Experience stage'>
                      {Object.entries(STATUS_META).map(([k,v])=>(
                        <Tooltip key={k}>
                          <TooltipTrigger asChild>
                            <button type='button' onClick={()=>updateChatterStatus(ch.id,k)} aria-label={v.label} aria-pressed={ch.status===k}
                              className='grid size-6 place-items-center rounded-md transition-colors hover:bg-accent'>
                              <StatusDot status={k} className={cn('transition-all', ch.status===k ? 'scale-125' : 'opacity-30 ring-0')} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{v.label}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size='icon-sm' variant='ghost' className='text-muted-foreground hover:text-bad' aria-label={`Deactivate ${ch.name}`}
                          onClick={()=>setConfirm({
                            title:`Deactivate ${ch.name}?`,
                            description:`${ch.name} will be marked as inactive.`,
                            action:'Deactivate', run:()=>deactivateChatter(ch),
                          })}><X/></Button>
                      </TooltipTrigger>
                      <TooltipContent>Deactivate</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={addChatter} className='flex flex-wrap gap-2'>
              <Input value={chatterForm.name} onChange={e=>setChatterForm(p=>({...p,name:e.target.value}))} placeholder='Name' aria-label='Name' required className='min-w-40 flex-1'/>
              <Input value={chatterForm.email} onChange={e=>setChatterForm(p=>({...p,email:e.target.value}))} placeholder='Email (optional)' aria-label='Email' className='min-w-40 flex-1'/>
              <Button type='submit'><Plus/>Add</Button>
            </form>
          </Section>
        </TabsContent>

        {/* Team */}
        <TabsContent value='team' className='grid gap-4'>
          <Section title='Team members' sub={`${members.length} people with access`}>
            <div className='overflow-hidden rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow className='bg-muted/40 hover:bg-muted/40'>
                    <TableHead className='ps-3'>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className='w-10'><span className='sr-only'>Actions</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(m=>{
                    const inactive = m.is_active === false;
                    const isMe = m.id === user?.id;
                    return (
                      <TableRow key={m.id} className={cn(inactive && 'text-muted-foreground')}>
                        <TableCell className='ps-3'>
                          <div className='flex items-center gap-2.5'>
                            <Avatar name={m.name} size={28} className={cn(inactive && 'opacity-50')}/>
                            <div className='min-w-0'>
                              <p className='font-medium'>{m.name}{isMe && <span className='ms-1.5 text-xs font-normal text-muted-foreground'>(you)</span>}</p>
                              <p className='text-xs text-muted-foreground'>{m.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><RoleBadge role={m.role}/></TableCell>
                        <TableCell>
                          {inactive
                            ? <Badge variant='outline' className='border-bad/30 bg-bad/10 text-bad'>Deactivated</Badge>
                            : <Badge variant='outline' className='border-good/30 bg-good/10 text-good'>Active</Badge>}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className='pe-3 text-right'>
                            {canManage(user, m) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size='icon-sm' variant='ghost' aria-label={`Manage ${m.name}`}><MoreHorizontal/></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align='end' className='w-48'>
                                  <DropdownMenuLabel className='truncate'>{m.name}</DropdownMenuLabel>
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      <DropdownMenuRadioGroup value={m.role}
                                        onValueChange={r=>{ if(r!==m.role) updateMember(m,{role:r},`${m.name} is now ${roleLabel(r).toLowerCase()}`); }}>
                                        {assignable.map(r=><DropdownMenuRadioItem key={r} value={r}>{roleLabel(r)}</DropdownMenuRadioItem>)}
                                      </DropdownMenuRadioGroup>
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuSeparator/>
                                  {inactive ? (
                                    <DropdownMenuItem onClick={()=>updateMember(m,{is_active:true},`${m.name} reactivated`)}>
                                      <UserCheck/>Reactivate
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem variant='destructive' onClick={()=>setConfirm({
                                      title:`Deactivate ${m.name}?`,
                                      description:"They lose access immediately: they're signed out and can't log in again until someone reactivates them. Nothing they did is deleted.",
                                      action:'Deactivate', run:()=>updateMember(m,{is_active:false},`${m.name} deactivated`),
                                    })}>
                                      <UserX/>Deactivate
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {isAdmin && (
              <p className='text-xs text-muted-foreground'>
                {user?.role === 'owner'
                  ? 'You can change anyone except yourself.'
                  : 'You can change people below admin. Only the owner can change admins.'}
              </p>
            )}
          </Section>

          {isAdmin&&(
            <Section title='Pending invitations' sub='Invites that haven’t been accepted yet. Revoking one stops its code working straight away.'>
              {invitations.length === 0 ? <Empty>No pending invitations.</Empty> : (
                <div className='divide-y rounded-md border'>
                  {invitations.map(inv=>(
                    <div key={inv.id} className='flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5'>
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-medium'>{inv.email}</p>
                        <p className='text-xs text-muted-foreground'>Sent {fmtDate(inv.created_at)} · expires {fmtDate(inv.expires_at)}</p>
                      </div>
                      <RoleBadge role={inv.role}/>
                      <Button size='sm' variant='outline' onClick={()=>setConfirm({
                        title:`Revoke the invitation for ${inv.email}?`,
                        description:'The invite code stops working immediately. You can send a new one later.',
                        action:'Revoke', run:()=>revokeInvite(inv),
                      })}>Revoke</Button>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {isAdmin&&(
            <Section title='Add people' sub='Invite someone by email, or create their account directly with a password you choose.'>
              <div className='grid gap-3'>
                <FormHeading>Invite someone</FormHeading>
                <p className='-mt-1 text-xs text-muted-foreground'>Creates a one-time link to send them. It expires after 7 days, and you can revoke it below.</p>
                <form onSubmit={sendInvite} className='grid gap-2 sm:grid-cols-[1fr_11rem_auto]'>
                  <Input value={inviteForm.email} onChange={e=>setInviteForm(p=>({...p,email:e.target.value}))} type='email' required placeholder='email@example.com' aria-label='Email'/>
                  <RoleSelect value={inviteForm.role} onChange={r=>setInviteForm(p=>({...p,role:r}))} roles={assignable}/>
                  <Button type='submit'>Invite</Button>
                </form>
                {inviteToken && (
                  <div className='flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2'>
                    <span className='shrink-0 text-xs text-muted-foreground'>Send them this link</span>
                    <code className='min-w-0 flex-1 truncate font-mono text-xs'>{inviteLink}</code>
                    <Button size='icon-sm' variant='ghost' onClick={copyToken} aria-label='Copy invite link'><Copy/></Button>
                  </div>
                )}
              </div>

              <div className='grid gap-3 border-t pt-4'>
                <FormHeading>Create new member</FormHeading>
                <form onSubmit={createMember} className='grid gap-3'>
                  <div className='grid gap-3 sm:grid-cols-2'>
                    <div className='grid gap-1.5'>
                      <Label htmlFor='nm-name'>Full name</Label>
                      <Input id='nm-name' value={memberForm.name} onChange={e=>setMemberForm(p=>({...p,name:e.target.value}))} required placeholder='Full name'/>
                    </div>
                    <div className='grid gap-1.5'>
                      <Label htmlFor='nm-email'>Email</Label>
                      <Input id='nm-email' value={memberForm.email} onChange={e=>setMemberForm(p=>({...p,email:e.target.value}))} type='email' required placeholder='email@example.com'/>
                    </div>
                    <div className='grid gap-1.5'>
                      <Label htmlFor='nm-pass'>Password</Label>
                      <Input id='nm-pass' value={memberForm.password} onChange={e=>setMemberForm(p=>({...p,password:e.target.value}))} type='password' required minLength={6} placeholder='At least 6 characters'/>
                    </div>
                    <div className='grid gap-1.5'>
                      <Label htmlFor='nm-role'>Role</Label>
                      <RoleSelect id='nm-role' value={memberForm.role} onChange={r=>setMemberForm(p=>({...p,role:r}))} roles={assignable}/>
                    </div>
                  </div>
                  <Button type='submit' className='w-fit'>Create member</Button>
                </form>
              </div>
            </Section>
          )}
        </TabsContent>

        {/* Shifts */}
        <TabsContent value='shifts'>
          <Section title='Shifts' sub={`${shifts.length} shifts configured`}>
            {shifts.length === 0 ? <Empty>No shifts yet.</Empty> : (
              <div className='grid gap-1.5'>
                {shifts.map(s=>(
                  <div key={s.id} className='flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-background px-3 py-2'>
                    <Clock className='size-4 text-muted-foreground'/>
                    <span className='min-w-0 flex-1 text-sm font-medium'>{s.name}</span>
                    <span className='font-mono text-xs tabular-nums text-muted-foreground'>{s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}</span>
                    {s.is_default&&<Chip tone='neutral'>Default</Chip>}
                    <span className='text-xs text-muted-foreground'>{s.shift_type}</span>
                  </div>
                ))}
              </div>
            )}
            {isAdmin&&<form onSubmit={addShift} className='flex flex-wrap gap-2'>
              <Input value={shiftForm.name} onChange={e=>setShiftForm(p=>({...p,name:e.target.value}))} placeholder='Shift name' aria-label='Shift name' required className='min-w-40 flex-1'/>
              <Input value={shiftForm.start_time} onChange={e=>setShiftForm(p=>({...p,start_time:e.target.value}))} type='time' aria-label='Start time' required className='w-28'/>
              <Input value={shiftForm.end_time} onChange={e=>setShiftForm(p=>({...p,end_time:e.target.value}))} type='time' aria-label='End time' required className='w-28'/>
              <Button type='submit'><Plus/>Add</Button>
            </form>}
          </Section>
        </TabsContent>

        {/* Templates */}
        <TabsContent value='templates'>
          <Section title='Task templates' sub={`${templates.length} templates — used in the New task window`}>
            {templates.length===0 ? <Empty>No templates yet</Empty> : (
              <div className='grid gap-1.5'>
                {templates.map(t=>(
                  <div key={t.id} className={cn('flex items-center gap-3 rounded-md border bg-background px-3 py-2 transition-colors',
                    editingTemplateId===t.id && 'border-link/40 bg-link/5')}>
                    <span className='grid size-8 shrink-0 place-items-center rounded-md bg-muted text-base' aria-hidden>{t.icon}</span>
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-sm font-medium'>{t.label}</p>
                      <p className='truncate text-xs text-muted-foreground'>{t.title} — {t.description?.slice(0,60)}{t.description?.length>60?'...':''}</p>
                    </div>
                    <span className='font-mono text-xs text-muted-foreground'>P{t.priority}</span>
                    <div className='flex items-center'>
                      <Button size='icon-sm' variant='ghost' aria-label={`Edit ${t.label}`} onClick={()=>{
                        setEditingTemplateId(t.id);
                        setTemplateForm({label:t.label,icon:t.icon,title:t.title,description:t.description||'',priority:t.priority});
                      }}><Pencil/></Button>
                      <Button size='icon-sm' variant='ghost' className='text-muted-foreground hover:text-bad' aria-label={`Remove ${t.label}`}
                        onClick={()=>setConfirm({
                          title:`Remove "${t.label}"?`,
                          description:'It disappears from the quick templates in the New task window.',
                          action:'Remove', run:()=>removeTemplate(t),
                        })}><Trash2/></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isAdmin&&(
              <div className='grid gap-3 border-t pt-4'>
                <FormHeading>{editingTemplateId ? 'Edit template' : 'Add template'}</FormHeading>
                <form onSubmit={saveTemplate} className='grid gap-3'>
                  <div className='grid grid-cols-[auto_1fr] gap-2 sm:grid-cols-[auto_1fr_1fr]'>
                    <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                      <PopoverTrigger asChild>
                        <Button type='button' variant='outline' size='icon' className='text-base' aria-label='Pick an icon'>{templateForm.icon}</Button>
                      </PopoverTrigger>
                      <PopoverContent align='start' className='w-auto p-2'>
                        <div className='grid grid-cols-8 gap-1'>
                          {EMOJIS.map(e=>(
                            <button key={e} type='button' onClick={()=>{setTemplateForm(p=>({...p,icon:e}));setEmojiOpen(false);}}
                              className={cn('grid size-8 place-items-center rounded-md text-base transition-colors hover:bg-accent', templateForm.icon===e && 'bg-accent')}>{e}</button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Input value={templateForm.label} onChange={e=>setTemplateForm(p=>({...p,label:e.target.value}))} required placeholder='Button label (e.g. Hiring)' aria-label='Button label'/>
                    <Input value={templateForm.title} onChange={e=>setTemplateForm(p=>({...p,title:e.target.value}))} required placeholder='Pre-filled title' aria-label='Pre-filled title' className='col-span-2 sm:col-span-1'/>
                  </div>
                  <div className='grid gap-2 sm:grid-cols-[1fr_9rem]'>
                    <Input value={templateForm.description} onChange={e=>setTemplateForm(p=>({...p,description:e.target.value}))} placeholder='Pre-filled description' aria-label='Pre-filled description'/>
                    <Select value={String(templateForm.priority)} onValueChange={v=>setTemplateForm(p=>({...p,priority:parseInt(v)}))}>
                      <SelectTrigger className='w-full' aria-label='Priority'><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value='1'>P1 Urgent</SelectItem>
                        <SelectItem value='2'>P2 High</SelectItem>
                        <SelectItem value='3'>P3 Medium</SelectItem>
                        <SelectItem value='4'>P4 Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='flex gap-2'>
                    <Button type='submit'>{editingTemplateId?'Save changes':'Add template'}</Button>
                    {editingTemplateId&&<Button type='button' variant='ghost' onClick={()=>{setEditingTemplateId(null);setTemplateForm(EMPTY_TEMPLATE);}}>Cancel</Button>}
                  </div>
                </form>
              </div>
            )}
          </Section>
        </TabsContent>

        {/* Cycles */}
        <TabsContent value='cycles'>
          <Section title='Weekly cycles' sub='Manage task cycles'>
            <div className='flex flex-wrap gap-2'>
              <Button onClick={startCycle}><Plus/>Start new cycle</Button>
              <Button variant='outline' onClick={closeWeek}>Close week</Button>
            </div>
          </Section>
        </TabsContent>
      </Tabs>

      {creatorDetail && (
        <CreatorDetailModal creator={creatorDetail} isAdmin={isAdmin}
          onClose={() => setCreatorDetail(null)} onChanged={load}/>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(open)=>{ if(!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={()=>confirm?.run()}>{confirm?.action}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
