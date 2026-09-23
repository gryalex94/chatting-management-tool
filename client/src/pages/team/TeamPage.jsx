import { useState, useEffect } from 'react';
import { Plus, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Status dot colours are data colours (one per chatter status).
const statusConfig = {
  new: { label: 'New', color: '#ef4444' },
  new_monitoring: { label: 'Monitoring', color: '#f97316' },
  developing: { label: 'Developing', color: '#eab308' },
  experienced: { label: 'Experienced', color: '#22c55e' },
};

export default function TeamPage() {
  const [chatters, setChatters] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newChatter, setNewChatter] = useState({ name: '', email: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [chattersRes, shiftsRes] = await Promise.all([
        api.get('/api/chatters'),
        api.get('/api/shifts'),
      ]);
      setChatters(chattersRes.data);
      setShifts(shiftsRes.data);
    } catch (err) {
      console.error('Team load error:', err?.message || err?.toString?.());
    } finally {
      setLoading(false);
    }
  }

  async function addChatter(e) {
    e.preventDefault();
    try {
      await api.post('/api/chatters', newChatter);
      toast.success('Chatter added!');
      setShowAdd(false);
      setNewChatter({ name: '', email: '' });
      loadData();
    } catch (err) {
      toast.error('Failed to add chatter');
    }
  }

  async function updateStatus(id, status) {
    try {
      await api.put(`/api/chatters/${id}`, { status });
      toast.success('Status updated');
      loadData();
    } catch (err) {
      toast.error('Failed to update');
    }
  }

  // Group chatters by shift
  function getShiftName(chatter) {
    const assignment = chatter.chatter_creator_assignments?.find(a => a.is_active);
    return assignment?.shifts?.name || 'Unassigned';
  }

  if (loading) {
    return (
      <div className='flex flex-col gap-4 sm:gap-6'>
        <div className='space-y-2'><Skeleton className='h-8 w-32' /><Skeleton className='h-4 w-24' /></div>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className='h-28 rounded-lg' />)}
        </div>
      </div>
    );
  }

  const unassigned = chatters.filter(c => getShiftName(c) === 'Unassigned');

  return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Team</h2>
          <p className='text-muted-foreground'>{chatters.length} chatters</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} variant={showAdd ? 'outline' : 'default'}>
          <Plus />Add chatter
        </Button>
      </div>

      {/* Add chatter form */}
      {showAdd && (
        <form onSubmit={addChatter}
          className='flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end'>
          <div className='grid flex-1 gap-2'>
            <Label htmlFor='team-name'>Name</Label>
            <Input id='team-name' value={newChatter.name} required placeholder='Chatter name'
              onChange={(e) => setNewChatter(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className='grid flex-1 gap-2'>
            <Label htmlFor='team-email'>Email <span className='font-normal text-muted-foreground'>(optional)</span></Label>
            <Input id='team-email' value={newChatter.email} placeholder='name@example.com'
              onChange={(e) => setNewChatter(p => ({ ...p, email: e.target.value }))} />
          </div>
          <Button type='submit'>Add</Button>
        </form>
      )}

      {/* Shift sections */}
      {shifts.map(shift => {
        const shiftChatters = chatters.filter(c => getShiftName(c) === shift.name);
        return (
          <section key={shift.id} className='space-y-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <h3 className='text-sm font-semibold'>{shift.name}</h3>
              <Badge variant='outline' className='gap-1 font-normal text-muted-foreground tabular-nums'>
                <Clock />{shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
              </Badge>
              <span className='text-xs text-muted-foreground'>{shiftChatters.length} chatters</span>
            </div>
            <ChatterGrid chatters={shiftChatters} onStatusChange={updateStatus} />
          </section>
        );
      })}

      {/* Unassigned chatters */}
      {unassigned.length > 0 && (
        <section className='space-y-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='text-sm font-semibold text-muted-foreground'>Unassigned</h3>
            <span className='text-xs text-muted-foreground'>{unassigned.length} chatters</span>
          </div>
          <ChatterGrid chatters={unassigned} onStatusChange={updateStatus} />
        </section>
      )}
    </div>
  );
}

function ChatterGrid({ chatters, onStatusChange }) {
  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
      {chatters.map(chatter => (
        <ChatterCard key={chatter.id} chatter={chatter} onStatusChange={onStatusChange} />
      ))}
    </div>
  );
}

function ChatterCard({ chatter, onStatusChange }) {
  const config = statusConfig[chatter.status] || statusConfig.new;
  const creators = chatter.chatter_creator_assignments
    ?.filter(a => a.is_active)
    ?.map(a => a.creators?.name)
    ?.filter(Boolean) || [];

  return (
    <div className='flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20'>
      <div className='flex items-center justify-between gap-2'>
        <h4 className='truncate text-sm font-medium'>{chatter.name}</h4>
        <Badge variant='outline' className='shrink-0 gap-1.5 font-normal'>
          <span className='size-2 rounded-full' style={{ background: config.color }} />{config.label}
        </Badge>
      </div>
      {creators.length > 0 && (
        <p className='text-xs text-muted-foreground'>{creators.join(', ')}</p>
      )}
      {/* Status changer */}
      <div className='mt-1 flex items-center gap-1'>
        <span className='me-1 text-xs text-muted-foreground'>Set status</span>
        {Object.entries(statusConfig).map(([key, val]) => {
          const on = chatter.status === key;
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <button type='button' aria-label={val.label} aria-pressed={on}
                  onClick={(e) => { e.stopPropagation(); onStatusChange(chatter.id, key); }}
                  className='flex size-6 items-center justify-center rounded-full transition-colors hover:bg-accent'>
                  {/* Data colour; the current status is full-size and opaque. */}
                  <span className={cn('rounded-full transition-all', on ? 'size-3.5 ring-2 ring-ring/40 ring-offset-1 ring-offset-card' : 'size-2.5 opacity-40')}
                    style={{ background: val.color }} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{val.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
