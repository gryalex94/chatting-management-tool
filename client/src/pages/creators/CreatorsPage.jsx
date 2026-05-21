import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Avatar, Chip, StatusDot } from '../../components/shared';
import { STATUS_META, avatarColor, initials } from '../../utils/helpers';
import { Plus, ArrowRight, AlertTriangle, Users, DollarSign, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

function PanelHeader({ title, sub, right }) {
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
      <div><div style={{ fontWeight:600, fontSize:13.5 }}>{title}</div>{sub&&<div style={{ color:'var(--fg-3)', fontSize:11.5, marginTop:2 }}>{sub}</div>}</div>
      <div style={{ flex:1 }}/>{right}
    </div>
  );
}

function ShiftSlot({ shift, chatters, creatorId, onAssign, onClickChatter }) {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const [startH] = (shift.start_time || '10:00').split(':').map(Number);
  const [endH] = (shift.end_time || '18:00').split(':').map(Number);
  const isActive = endH > startH
    ? currentHour >= startH && currentHour < endH
    : currentHour >= startH || currentHour < endH;

  const slotChatters = chatters.filter(ch => {
    const assignment = ch.chatter_creator_assignments?.find(a =>
      a.is_active && a.creator_id === creatorId && a.shift_id === shift.id
    );
    return !!assignment;
  });

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6, padding:'0 2px' }}>
        <span className="label" style={{ fontSize:10 }}>{shift.name}</span>
        <span className="mono" style={{ fontSize:10, color:'var(--fg-3)' }}>
          {shift.start_time?.slice(0,5)} – {shift.end_time?.slice(0,5)}
        </span>
        {isActive && <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--good)', marginLeft:2 }}/>}
        {slotChatters.length === 0 && (
          <span style={{ fontSize:10, color:'var(--bad)', marginLeft:'auto' }}>no one working!</span>
        )}
      </div>

      {slotChatters.length > 0 ? (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {slotChatters.map(ch => (
            <ChatterRow key={ch.id} chatter={ch} onClick={() => onClickChatter(ch)} />
          ))}
        </div>
      ) : (
        <div
          onClick={() => onAssign(creatorId, shift.id)}
          style={{
            padding: '12px', borderRadius: 'var(--r-tile)', cursor: 'pointer',
            border: '1px dashed var(--border-strong)', background: 'transparent',
            color: 'var(--fg-3)', fontSize: 11.5, textAlign: 'center',
            transition: 'border-color .12s, background .12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='var(--indigo-line)'; e.currentTarget.style.background='var(--indigo-soft)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border-strong)'; e.currentTarget.style.background='transparent'; }}
        >
          Drop a chatter into this shift
        </div>
      )}
    </div>
  );
}

function ChatterRow({ chatter, onClick }) {
  const meta = STATUS_META[chatter.status] || STATUS_META.new;
  return (
    <div
      onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
        background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)',
        cursor:'pointer', transition:'border-color .12s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor='var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
    >
      <Avatar name={chatter.name} size={28}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12.5, fontWeight:500, color:meta.nameColor }}>{chatter.name}</div>
        <div className="mono" style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:1 }}>
          {chatter.email || '—'}
        </div>
      </div>
      <ArrowRight size={12} style={{ color:'var(--fg-3)' }}/>
    </div>
  );
}

function CreatorCard({ creator, chatters, shifts, onAssign, onClickChatter }) {
  const assignedChatters = chatters.filter(ch =>
    ch.chatter_creator_assignments?.some(a => a.is_active && a.creator_id === creator.id)
  );

  return (
    <div style={{
      background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)',
      overflow:'hidden', display:'flex', flexDirection:'column',
    }}>
      {/* Creator header */}
      <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)' }}>
        <Avatar name={creator.name} size={32}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600 }}>{creator.name}</div>
          <div style={{ display:'flex', gap:8, marginTop:2, fontSize:11, color:'var(--fg-3)' }}>
            <span>{assignedChatters.length} chatters</span>
          </div>
        </div>
        <button className="btn sm ghost" style={{ color:'var(--fg-3)' }}>···</button>
      </div>

      {/* Shift slots */}
      <div style={{ padding:'12px 14px', flex:1 }}>
        {shifts.map(shift => (
          <ShiftSlot
            key={shift.id}
            shift={shift}
            chatters={chatters}
            creatorId={creator.id}
            onAssign={onAssign}
            onClickChatter={onClickChatter}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Assign Modal ───────────────────────────────── */
function AssignModal({ chatters, shifts, targetCreatorId, targetShiftId, creators, onAssign, onClose }) {
  const unassigned = chatters.filter(ch =>
    !ch.chatter_creator_assignments?.some(a => a.is_active)
  );
  const allChatters = chatters; // show all, highlight unassigned

  const creatorName = creators.find(c => c.id === targetCreatorId)?.name || '';
  const shiftName = shifts.find(s => s.id === targetShiftId)?.name || '';

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={onClose}>
      <div style={{ width:400, maxHeight:'70vh', background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>
        <PanelHeader
          title={`Assign to ${creatorName}`}
          sub={`${shiftName} shift`}
        />
        <div style={{ padding:12, maxHeight:400, overflow:'auto' }}>
          {unassigned.length === 0 ? (
            <div style={{ padding:20, textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>
              All chatters are already assigned. Add new chatters from Settings first.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div className="label" style={{ padding:'4px 4px' }}>Unassigned chatters</div>
              {unassigned.map(ch => (
                <div
                  key={ch.id}
                  onClick={() => onAssign(ch.id, targetCreatorId, targetShiftId)}
                  style={{
                    display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
                    background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)',
                    cursor:'pointer', transition:'border-color .12s, background .12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--indigo-line)'; e.currentTarget.style.background='var(--indigo-soft)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--bg-2)'; }}
                >
                  <Avatar name={ch.name} size={28}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12.5, fontWeight:500 }}>{ch.name}</div>
                    <div style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:1 }}>
                      <StatusDot status={ch.status}/> {STATUS_META[ch.status]?.label}
                    </div>
                  </div>
                  <Plus size={14} style={{ color:'var(--indigo-bright)' }}/>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────── */
export default function CreatorsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [creators, setCreators] = useState([]);
  const [chatters, setChatters] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignTarget, setAssignTarget] = useState(null); // { creatorId, shiftId }

  const load = useCallback(async () => {
    try {
      const [cr, ch, sh] = await Promise.all([
        api.get('/api/creators'), api.get('/api/chatters'), api.get('/api/shifts'),
      ]);
      setCreators(cr.data); setChatters(ch.data); setShifts(sh.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleOpenAssign(creatorId, shiftId) {
    setAssignTarget({ creatorId, shiftId });
  }

  async function handleAssign(chatterId, creatorId, shiftId) {
    try {
      await api.post(`/api/chatters/${chatterId}/assign`, { creatorId, shiftId });
      toast.success('Chatter assigned!');
      setAssignTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to assign');
    }
  }

  function handleClickChatter(chatter) {
    // TODO: open chatter profile drawer/page
    navigate(`/chatters/${chatter.id}`);
  }

  const unassigned = chatters.filter(ch =>
    !ch.chatter_creator_assignments?.some(a => a.is_active)
  );

  const assignedCount = chatters.length - unassigned.length;

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', paddingTop:80 }}>
      <div style={{ width:24, height:24, border:'2px solid var(--indigo)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .6s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div className="animate-in">
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Creator Wall</h1>
          <p style={{ fontSize:13, color:'var(--fg-2)', marginTop:4 }}>
            Drag a chatter into a shift slot to assign. Click a chatter to open their profile.
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <Chip tone="indigo"><Users size={12}/> {creators.length} Creators</Chip>
          <Chip tone="good">{assignedCount}/{chatters.length} assigned</Chip>
          {unassigned.length > 0 && <Chip tone="warn"><AlertTriangle size={12}/> {unassigned.length} empty shifts</Chip>}
        </div>
      </div>

      {/* Creator grid */}
      {creators.length === 0 ? (
        <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:60, textAlign:'center' }}>
          <p style={{ color:'var(--fg-3)', fontSize:14, marginBottom:12 }}>No creators yet</p>
          <p style={{ color:'var(--fg-3)', fontSize:12 }}>Go to Settings → add your creators first, then come back to assign chatters.</p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:16, marginBottom:24 }}>
          {creators.map(cr => (
            <CreatorCard
              key={cr.id}
              creator={cr}
              chatters={chatters}
              shifts={shifts.filter(s => s.is_default || s.is_active)}
              onAssign={handleOpenAssign}
              onClickChatter={handleClickChatter}
            />
          ))}
        </div>
      )}

      {/* Unassigned chatters */}
      {unassigned.length > 0 && (
        <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
          <PanelHeader
            title="Unassigned chatters"
            sub={`${unassigned.length} chatters not assigned to any creator`}
            right={<Chip tone="warn">{unassigned.length}</Chip>}
          />
          <div style={{ padding:12, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:8 }}>
            {unassigned.map(ch => (
              <ChatterRow key={ch.id} chatter={ch} onClick={() => handleClickChatter(ch)}/>
            ))}
          </div>
        </div>
      )}

      {/* Assign modal */}
      {assignTarget && (
        <AssignModal
          chatters={chatters}
          shifts={shifts}
          creators={creators}
          targetCreatorId={assignTarget.creatorId}
          targetShiftId={assignTarget.shiftId}
          onAssign={handleAssign}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  );
}
