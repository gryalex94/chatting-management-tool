import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Avatar, Chip, StatusDot } from '../../components/shared';
import { STATUS_META, avatarColor, initials } from '../../utils/helpers';
import { Plus, ArrowRight, AlertTriangle, Users, Pencil, Scissors, XCircle, MoreHorizontal, Clock, Trash2, Calendar } from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, useDraggable, useDroppable,
} from '@dnd-kit/core';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_NUMBERS = [1,2,3,4,5,6,7];

function getTodayDayNumber() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function getWeekDates() {
  const now = new Date();
  const jsDay = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (jsDay === 0 ? -6 : 1 - jsDay));
  return DAY_NUMBERS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/* ─── Panel Header ───────────────────────────────── */
function PanelHeader({ title, sub, right }) {
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
      <div><div style={{ fontWeight:600, fontSize:13.5 }}>{title}</div>{sub&&<div style={{ color:'var(--fg-3)', fontSize:11.5, marginTop:2 }}>{sub}</div>}</div>
      <div style={{ flex:1 }}/>{right}
    </div>
  );
}

/* ─── Draggable Chatter Wrapper ──────────────────── */
function DraggableChatter({ chatter, uniqueId, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: uniqueId || `chatter-${chatter.id}`,
    data: { chatter },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1, cursor: 'grab' }}>
      {children}
    </div>
  );
}

/* ─── Draggable Creator Card Wrapper ─────────────── */
function DraggableCreatorWrap({ creator, draggingType, children }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `creator-${creator.id}`,
    data: { creator, type: 'creator' },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `creator-drop-${creator.id}`,
    data: { creatorId: creator.id, type: 'creator-merge' },
  });

  // Only glow when another CREATOR is dragged over, not chatters
  const showMergeGlow = isOver && draggingType === 'creator';

  return (
    <div ref={node => { setDragRef(node); setDropRef(node); }}
      {...listeners} {...attributes}
      style={{
        opacity: isDragging ? 0.4 : 1,
        outline: showMergeGlow ? '2px solid var(--indigo-bright)' : 'none',
        outlineOffset: -2, borderRadius: 'var(--r-panel)',
        boxShadow: showMergeGlow ? '0 0 20px rgba(99,102,241,0.25)' : 'none',
        transition: 'outline .15s, box-shadow .15s, opacity .15s', cursor: 'grab',
      }}>
      {children}
    </div>
  );
}

/* ─── Diagonal stripes SVG pattern ───────────────── */
const STRIPE_ID = 'dayoff-stripes';
function StripesPatternDef() {
  return (
    <svg width="0" height="0" style={{ position:'absolute' }}>
      <defs>
        <pattern id={STRIPE_ID} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="8" fill="var(--fg-4, #888)" opacity="0.13"/>
        </pattern>
      </defs>
    </svg>
  );
}

/* ─── Chatter Row ────────────────────────────────── */
function ChatterRow({ chatter, onClick, onRemove, isDayOff, isOvertime }) {
  const meta = STATUS_META[chatter.status] || STATUS_META.new;
  return (
    <div onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
        background: isDayOff ? 'var(--bg-3)' : 'var(--bg-2)',
        border: isOvertime ? '1px solid var(--warn)' : '1px solid var(--border)',
        borderRadius:'var(--r-tile)', cursor:'pointer', transition:'border-color .12s',
        position:'relative', overflow:'hidden',
      }}
      onMouseEnter={e => { if (!isDayOff) e.currentTarget.style.borderColor='var(--border-strong)'; }}
      onMouseLeave={e => { if (!isDayOff) e.currentTarget.style.borderColor = isOvertime ? 'var(--warn)' : 'var(--border)'; }}>

      {isDayOff && (
        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:0 }}>
          <rect width="100%" height="100%" fill={`url(#${STRIPE_ID})`}/>
        </svg>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0, position:'relative', zIndex:1 }}>
        <div style={{ position:'relative' }}>
          <Avatar name={chatter.name} size={28}/>
          {isDayOff && (
            <div style={{
              position:'absolute', bottom:-2, right:-4,
              background:'var(--fg-3)', color:'#fff', fontSize:7, fontWeight:700,
              borderRadius:6, padding:'1px 4px', border:'1.5px solid var(--bg-1)', whiteSpace:'nowrap',
            }}>OFF</div>
          )}
          {isOvertime && !isDayOff && (
            <div style={{
              position:'absolute', bottom:-2, right:-4,
              background:'var(--warn)', color:'#fff', fontSize:7, fontWeight:700,
              borderRadius:6, padding:'1px 3px', border:'1.5px solid var(--bg-1)',
            }}>OT</div>
          )}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{
            fontSize:12.5, fontWeight:500,
            color: isDayOff ? 'var(--fg-3)' : meta.nameColor,
            textDecoration: isDayOff ? 'line-through' : 'none',
          }}>{chatter.name}</div>
          <div className="mono" style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:1 }}>
            {isDayOff ? 'Day off' : isOvertime ? 'Overtime cover' : (chatter.email || '—')}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:2, position:'relative', zIndex:1 }}>
        {onRemove ? (
          <button onClick={e => { e.stopPropagation(); onRemove(); }} title="Unassign"
            style={{
              background:'none', border:'none', cursor:'pointer', padding:4,
              color:'var(--fg-3)', fontSize:14, lineHeight:1, borderRadius:4, transition:'color .12s, background .12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color='var(--bad)'; e.currentTarget.style.background='var(--bg-3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color='var(--fg-3)'; e.currentTarget.style.background='none'; }}>
            ✕</button>
        ) : (
          <ArrowRight size={12} style={{ color:'var(--fg-3)' }}/>
        )}
      </div>
    </div>
  );
}

/* ─── Droppable Shift Slot ───────────────────────── */
function ShiftSlot({ shift, chatters, creatorId, onAssign, onClickChatter, onRemove, selectedDay, overtimeList = [], draggingType }) {
  const droppableId = `slot-${creatorId}-${shift.id}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { creatorId, shiftId: shift.id },
  });

  // Only react to chatter drops, not creator drops
  const dropActive = isOver && draggingType !== 'creator';

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
    <div ref={setNodeRef} style={{ marginBottom: 8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6, padding:'0 2px' }}>
        <span className="label" style={{ fontSize:10 }}>{shift.name}</span>
        <span className="mono" style={{ fontSize:10, color:'var(--fg-3)' }}>
          {shift.start_time?.slice(0,5)} – {shift.end_time?.slice(0,5)}
        </span>
        {isActive && selectedDay === getTodayDayNumber() && <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--good)', marginLeft:2 }}/>}
        {slotChatters.length === 0 && !dropActive && (
          <span style={{ fontSize:10, color:'var(--bad)', marginLeft:'auto' }}>no one working!</span>
        )}
      </div>

      {slotChatters.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {slotChatters.map(ch => {
            const workDays = ch.work_days || [1,2,3,4,5];
            const isDayOff = !workDays.includes(selectedDay);
            const isOT = overtimeList.some(ot => ot.chatter_id === ch.id && ot.day_of_week === selectedDay);
            return (
              <DraggableChatter key={ch.id} chatter={ch} uniqueId={`chatter-${ch.id}-${creatorId}-${shift.id}`}>
                <ChatterRow chatter={ch} onClick={() => onClickChatter(ch)}
                  onRemove={() => onRemove(ch.id, creatorId, shift.id)}
                  isDayOff={isDayOff} isOvertime={isOT}/>
              </DraggableChatter>
            );
          })}
        </div>
      )}

      {(slotChatters.length === 0 || dropActive) && (
        <div
          onClick={() => !dropActive && onAssign(creatorId, shift.id)}
          style={{
            padding: dropActive ? '16px' : '12px', borderRadius: 'var(--r-tile)', cursor: 'pointer',
            border: dropActive ? '2px dashed var(--indigo-bright)' : '1px dashed var(--border-strong)',
            background: dropActive ? 'var(--indigo-soft)' : 'transparent',
            color: dropActive ? 'var(--indigo-bright)' : 'var(--fg-3)',
            fontSize: 11.5, textAlign: 'center', transition: 'all .15s ease',
            marginTop: slotChatters.length > 0 ? 6 : 0,
            boxShadow: dropActive ? '0 0 12px rgba(99,102,241,0.15)' : 'none',
          }}>
          {dropActive ? '↓ Drop here to assign' : 'Drop a chatter into this shift'}
        </div>
      )}
    </div>
  );
}

/* ─── Creator Card Menu ──────────────────────────── */
function CreatorMenu({ creator, mergedCreators, onRename, onSplit, onDeactivate, onManageShifts }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const mi = {
    display:'flex', alignItems:'center', gap:8, padding:'8px 12px', fontSize:12.5,
    cursor:'pointer', transition:'background .1s', background:'transparent',
    border:'none', width:'100%', textAlign:'left', color:'var(--fg-1)',
  };

  return (
    <div ref={menuRef} style={{ position:'relative' }}>
      <button className="btn sm ghost" style={{ color:'var(--fg-3)', padding:4 }}
        onClick={e => { e.stopPropagation(); setOpen(!open); }}>
        <MoreHorizontal size={16}/>
      </button>
      {open && (
        <div style={{
          position:'absolute', top:'100%', right:0, marginTop:4,
          background:'var(--bg-1)', border:'1px solid var(--border)',
          borderRadius:'var(--r-tile)', boxShadow:'0 8px 24px rgba(0,0,0,0.2)',
          minWidth:200, zIndex:50, overflow:'hidden',
        }}>
          <button style={mi} onMouseEnter={e => e.currentTarget.style.background='var(--bg-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}
            onClick={e => { e.stopPropagation(); setOpen(false); onRename(creator); }}><Pencil size={13}/> Rename</button>
          <button style={mi} onMouseEnter={e => e.currentTarget.style.background='var(--bg-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}
            onClick={e => { e.stopPropagation(); setOpen(false); onManageShifts(); }}><Clock size={13}/> Manage Shifts</button>
          {mergedCreators.length > 0 && (<>
            <div style={{ height:1, background:'var(--border)', margin:'4px 0' }}/>
            <div style={{ padding:'6px 12px', fontSize:10, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:0.5 }}>Split</div>
            {mergedCreators.map(m => (
              <button key={m.id} style={mi} onMouseEnter={e => e.currentTarget.style.background='var(--bg-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}
                onClick={e => { e.stopPropagation(); setOpen(false); onSplit(m.id, m.name); }}><Scissors size={13}/> {m.name}</button>
            ))}
          </>)}
          <div style={{ height:1, background:'var(--border)', margin:'4px 0' }}/>
          <button style={{ ...mi, color:'var(--bad)' }} onMouseEnter={e => e.currentTarget.style.background='var(--bg-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}
            onClick={e => { e.stopPropagation(); setOpen(false); onDeactivate(creator); }}><XCircle size={13}/> Deactivate</button>
        </div>
      )}
    </div>
  );
}

/* ─── Creator Card ───────────────────────────────── */
function CreatorCard({ creator, chatters, shifts, onAssign, onClickChatter, onRemove, onSplit, onRename, onDeactivate, mergedCreators, onManageShifts, selectedDay, overtimeList, draggingType }) {
  const assignedChatters = chatters.filter(ch =>
    ch.chatter_creator_assignments?.some(a => a.is_active && a.creator_id === creator.id)
  );
  const nameParts = creator.name.split(' + ');
  const isMerged = nameParts.length > 1;

  return (
    <div style={{
      background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)',
      overflow:'hidden', display:'flex', flexDirection:'column',
    }}>
      <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)' }}>
        <div style={{ position:'relative' }}>
          <Avatar name={nameParts[0]} size={32}/>
          {isMerged && (
            <div style={{
              position:'absolute', bottom:-2, right:-6, background:'var(--indigo)', color:'#fff',
              fontSize:9, fontWeight:700, borderRadius:10, padding:'1px 5px', border:'2px solid var(--bg-1)',
            }}>+{nameParts.length - 1}</div>
          )}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600 }}>{creator.name}</div>
          <div style={{ display:'flex', gap:8, marginTop:2, fontSize:11, color:'var(--fg-3)' }}>
            <span>{assignedChatters.length} chatters</span>
            {isMerged && <span style={{ color:'var(--indigo-bright)' }}>{nameParts.length} accounts</span>}
          </div>
        </div>
        <CreatorMenu creator={creator} mergedCreators={mergedCreators}
          onRename={onRename} onSplit={onSplit} onDeactivate={onDeactivate} onManageShifts={onManageShifts}/>
      </div>
      <div style={{ padding:'12px 14px', flex:1 }}>
        {shifts.map(shift => (
          <ShiftSlot key={shift.id} shift={shift} chatters={chatters} creatorId={creator.id}
            onAssign={onAssign} onClickChatter={onClickChatter} onRemove={onRemove}
            selectedDay={selectedDay} overtimeList={overtimeList} draggingType={draggingType}/>
        ))}
      </div>
    </div>
  );
}

/* ─── Assign Modal ───────────────────────────────── */
function AssignModal({ chatters, shifts, targetCreatorId, targetShiftId, creators, onAssign, onClose }) {
  const unassigned = chatters.filter(ch => !ch.chatter_creator_assignments?.some(a => a.is_active));
  const creatorName = creators.find(c => c.id === targetCreatorId)?.name || '';
  const shiftName = shifts.find(s => s.id === targetShiftId)?.name || '';
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ width:400, maxHeight:'70vh', background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
        <PanelHeader title={`Assign to ${creatorName}`} sub={`${shiftName} shift`}/>
        <div style={{ padding:12, maxHeight:400, overflow:'auto' }}>
          {unassigned.length === 0 ? (
            <div style={{ padding:20, textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>All chatters are already assigned.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div className="label" style={{ padding:'4px 4px' }}>Unassigned chatters</div>
              {unassigned.map(ch => (
                <div key={ch.id} onClick={() => onAssign(ch.id, targetCreatorId, targetShiftId)}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)', cursor:'pointer', transition:'border-color .12s, background .12s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--indigo-line)'; e.currentTarget.style.background='var(--indigo-soft)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--bg-2)'; }}>
                  <Avatar name={ch.name} size={28}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12.5, fontWeight:500 }}>{ch.name}</div>
                    <div style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:1 }}><StatusDot status={ch.status}/> {STATUS_META[ch.status]?.label}</div>
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

/* ─── Rename Modal ───────────────────────────────── */
function RenameModal({ creator, onSave, onClose }) {
  const [name, setName] = useState(creator.name);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ width:380, background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
        <PanelHeader title="Rename Creator"/>
        <div style={{ padding:16 }}>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            style={{ width:'100%', padding:'10px 12px', fontSize:14, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)', color:'var(--fg-0)', outline:'none' }}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(creator.id, name.trim()); }}/>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:14 }}>
            <button className="btn sm ghost" onClick={onClose}>Cancel</button>
            <button className="btn sm" style={{ background:'var(--indigo)', color:'#fff' }} onClick={() => name.trim() && onSave(creator.id, name.trim())}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Manage Shifts Modal ────────────────────────── */
function ShiftsModal({ shifts, creatorId, onSave, onDelete, onCreate, onClose }) {
  const [edited, setEdited] = useState(shifts.map(s => ({ ...s })));
  const [newShift, setNewShift] = useState({ name: '', start_time: '00:00', end_time: '08:00' });
  const [showNew, setShowNew] = useState(false);
  function updateField(idx, field, value) {
    setEdited(prev => { const copy = [...prev]; copy[idx] = { ...copy[idx], [field]: value }; return copy; });
  }
  const is = { padding:'8px 10px', fontSize:13, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)', color:'var(--fg-0)', outline:'none' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ width:480, maxHeight:'80vh', background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
        <PanelHeader title="Manage Shifts" sub="Edit shift names and times, or add new ones"/>
        <div style={{ padding:16, maxHeight:'60vh', overflow:'auto' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {edited.map((shift, idx) => (
              <div key={shift.id} style={{ padding:12, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <input value={shift.name} onChange={e => updateField(idx, 'name', e.target.value)} style={{ ...is, flex:1, fontWeight:600 }} placeholder="Shift name"/>
                  <button onClick={() => { if (window.confirm(`Delete "${shift.name}"?`)) onDelete(shift.id); }}
                    style={{ background:'none', border:'none', cursor:'pointer', padding:6, color:'var(--fg-3)', borderRadius:4 }}
                    onMouseEnter={e => e.currentTarget.style.color='var(--bad)'} onMouseLeave={e => e.currentTarget.style.color='var(--fg-3)'}><Trash2 size={14}/></button>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <div style={{ flex:1 }}><div className="label" style={{ fontSize:10, marginBottom:4 }}>Start</div>
                    <input type="time" value={shift.start_time?.slice(0,5)||'00:00'} onChange={e => updateField(idx,'start_time',e.target.value+':00')} style={{ ...is, width:'100%' }}/></div>
                  <div style={{ color:'var(--fg-3)', paddingTop:18 }}>→</div>
                  <div style={{ flex:1 }}><div className="label" style={{ fontSize:10, marginBottom:4 }}>End</div>
                    <input type="time" value={shift.end_time?.slice(0,5)||'08:00'} onChange={e => updateField(idx,'end_time',e.target.value+':00')} style={{ ...is, width:'100%' }}/></div>
                </div>
              </div>
            ))}
          </div>
          {showNew ? (
            <div style={{ padding:12, background:'var(--indigo-soft)', border:'1px solid var(--indigo-line)', borderRadius:'var(--r-tile)', marginTop:12 }}>
              <div className="label" style={{ fontSize:10, marginBottom:8 }}>New Shift</div>
              <input value={newShift.name} onChange={e => setNewShift(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Rotating, Night" autoFocus style={{ ...is, width:'100%', marginBottom:8 }}/>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ flex:1 }}><div className="label" style={{ fontSize:10, marginBottom:4 }}>Start</div>
                  <input type="time" value={newShift.start_time} onChange={e => setNewShift(p => ({ ...p, start_time: e.target.value }))} style={{ ...is, width:'100%' }}/></div>
                <div style={{ color:'var(--fg-3)', paddingTop:18 }}>→</div>
                <div style={{ flex:1 }}><div className="label" style={{ fontSize:10, marginBottom:4 }}>End</div>
                  <input type="time" value={newShift.end_time} onChange={e => setNewShift(p => ({ ...p, end_time: e.target.value }))} style={{ ...is, width:'100%' }}/></div>
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:10 }}>
                <button className="btn sm ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button className="btn sm" style={{ background:'var(--indigo)', color:'#fff' }}
                  onClick={() => { if (!newShift.name.trim()) return toast.error('Name required');
                    onCreate(newShift.name.trim(), newShift.start_time+':00', newShift.end_time+':00', creatorId);
                    setNewShift({ name:'', start_time:'00:00', end_time:'08:00' }); setShowNew(false); }}>Add</button>
              </div>
            </div>
          ) : (
            <button className="btn sm ghost" style={{ marginTop:12, width:'100%', justifyContent:'center', display:'flex', alignItems:'center', gap:6 }}
              onClick={() => setShowNew(true)}><Plus size={14}/> Add New Shift</button>
          )}
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn sm ghost" onClick={onClose}>Cancel</button>
          <button className="btn sm" style={{ background:'var(--indigo)', color:'#fff' }} onClick={() => onSave(edited)}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Week Day Bar ───────────────────────────────── */
function WeekBar({ selectedDay, onSelect }) {
  const today = getTodayDayNumber();
  const weekDates = getWeekDates();
  return (
    <div style={{ display:'flex', gap:4, padding:'12px 0', marginBottom:16 }}>
      {DAY_LABELS.map((label, i) => {
        const dayNum = DAY_NUMBERS[i];
        const isSelected = dayNum === selectedDay;
        const isToday = dayNum === today;
        const dateStr = weekDates[i].getDate();
        return (
          <button key={dayNum} onClick={() => onSelect(dayNum)}
            style={{
              flex:1, padding:'8px 0', borderRadius:'var(--r-tile)', cursor:'pointer',
              border: isSelected ? '2px solid var(--indigo-bright)' : '1px solid var(--border)',
              background: isSelected ? 'var(--indigo-soft)' : 'var(--bg-1)',
              color: isSelected ? 'var(--indigo-bright)' : 'var(--fg-2)',
              fontWeight: isSelected ? 700 : 500, fontSize:12, textAlign:'center',
              transition:'all .12s', position:'relative',
            }}>
            <div>{label}</div>
            <div className="mono" style={{ fontSize:10, marginTop:2, opacity:0.7 }}>{dateStr}</div>
            {isToday && <div style={{ position:'absolute', top:4, right:4, width:5, height:5, borderRadius:'50%', background: isSelected ? 'var(--indigo-bright)' : 'var(--good)' }}/>}
          </button>
        );
      })}
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
  const [assignTarget, setAssignTarget] = useState(null);
  const [activeChatter, setActiveChatter] = useState(null);
  const [mergePrompt, setMergePrompt] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [shiftsCreatorId, setShiftsCreatorId] = useState(null);
  const [mergedMap, setMergedMap] = useState({});
  const [overtimeList, setOvertimeList] = useState([]);
  const [selectedDay, setSelectedDay] = useState(getTodayDayNumber());
  const [draggingType, setDraggingType] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = useCallback(async () => {
    try {
      const [cr, ch, sh, ot, merged] = await Promise.all([
        api.get('/api/creators'),
        api.get('/api/chatters'),
        api.get('/api/shifts'),
        api.get('/api/chatters/overtime/list'),
        api.get('/api/creators/merged/all'),
      ]);
      setCreators(cr.data);
      setChatters(ch.data);
      setShifts(sh.data);
      setOvertimeList(ot.data || []);
      setMergedMap(merged.data || {});
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleOpenAssign(creatorId, shiftId) { setAssignTarget({ creatorId, shiftId }); }

  async function handleAssign(chatterId, creatorId, shiftId) {
    try { await api.post(`/api/chatters/${chatterId}/assign`, { creatorId, shiftId });
      toast.success('Chatter assigned!'); setAssignTarget(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to assign'); }
  }

  function handleClickChatter(chatter) { navigate(`/chatters/${chatter.id}`); }

  async function handleRemove(chatterId, creatorId, shiftId) {
    try { await api.post(`/api/chatters/${chatterId}/unassign`, { creatorId, shiftId });
      toast.success('Chatter unassigned'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to unassign'); }
  }

  async function confirmMerge() {
    if (!mergePrompt) return;
    try { await api.post(`/api/creators/${mergePrompt.targetId}/merge`, { sourceId: mergePrompt.sourceId });
      toast.success('Creators merged!'); setMergePrompt(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to merge'); }
  }

  async function handleSplit(sourceId, sourceName) {
    if (!window.confirm(`Split "${sourceName}" back into its own card?`)) return;
    try { await api.post(`/api/creators/${sourceId}/split`); toast.success(`${sourceName} is back!`); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to split'); }
  }

  async function handleRename(creatorId, newName) {
    try { await api.put(`/api/creators/${creatorId}`, { name: newName }); toast.success('Renamed'); setRenameTarget(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  }

  async function handleDeactivate(creator) {
    if (!window.confirm(`Deactivate "${creator.name}"?`)) return;
    try { await api.put(`/api/creators/${creator.id}`, { is_active: false }); toast.success('Deactivated'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  }

  async function handleSaveShifts(editedShifts) {
    try { await Promise.all(editedShifts.map(s => api.put(`/api/shifts/${s.id}`, { name: s.name, start_time: s.start_time, end_time: s.end_time })));
      toast.success('Shifts updated'); setShiftsCreatorId(null); load();
    } catch { toast.error('Failed'); }
  }

  async function handleDeleteShift(shiftId) {
    try { await api.delete(`/api/shifts/${shiftId}`); toast.success('Deleted'); setShiftsCreatorId(null); load();
    } catch { toast.error('Failed'); }
  }

  async function handleCreateShift(name, startTime, endTime, creatorId) {
    try { await api.post('/api/shifts', { name, start_time: startTime, end_time: endTime, creatorId }); toast.success(`"${name}" created`); load();
    } catch { toast.error('Failed'); }
  }

  function handleDragStart(event) {
    const data = event.active.data.current;
    if (data?.chatter) { setActiveChatter(data.chatter); setDraggingType('chatter'); }
    else if (data?.type === 'creator') { setDraggingType('creator'); }
  }

  async function handleDragEnd(event) {
    setActiveChatter(null);
    setDraggingType(null);
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current;
    const overData = over.data.current;

    // Creator → Creator merge
    if (activeData?.type === 'creator' && overData?.type === 'creator-merge') {
      if (activeData.creator.id !== overData.creatorId)
        setMergePrompt({ sourceId: activeData.creator.id, targetId: overData.creatorId });
      return;
    }

    // Creator dragged onto a shift slot — ignore
    if (activeData?.type === 'creator') return;

    // Chatter → Shift slot assign
    const chatter = activeData?.chatter;
    if (!chatter || !overData?.creatorId || !overData?.shiftId) return;
    if (chatter.chatter_creator_assignments?.some(a => a.is_active && a.creator_id === overData.creatorId && a.shift_id === overData.shiftId)) return;

    try { await api.post(`/api/chatters/${chatter.id}/assign`, { creatorId: overData.creatorId, shiftId: overData.shiftId });
      toast.success(`${chatter.name} assigned!`); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  }

  const unassigned = chatters.filter(ch => !ch.chatter_creator_assignments?.some(a => a.is_active));
  const assignedCount = chatters.length - unassigned.length;
  const offCount = chatters.filter(ch => {
    const wd = ch.work_days || [1,2,3,4,5];
    return !wd.includes(selectedDay) && ch.chatter_creator_assignments?.some(a => a.is_active);
  }).length;

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', paddingTop:80 }}>
      <div style={{ width:24, height:24, border:'2px solid var(--indigo)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .6s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    <StripesPatternDef/>
    <div className="animate-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700 }}>Shifts Overview</h1>
          <p style={{ fontSize:13, color:'var(--fg-2)', marginTop:4 }}>
            Select a day to see who's working. Drag chatters into shifts or creators onto each other to merge.
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
          <Chip tone="indigo"><Users size={12}/> {creators.length} Creators</Chip>
          <Chip tone="good">{assignedCount}/{chatters.length} assigned</Chip>
          {offCount > 0 && <Chip tone="warn"><Calendar size={12}/> {offCount} off {DAY_LABELS[selectedDay - 1]}</Chip>}
          {unassigned.length > 0 && <Chip tone="bad"><AlertTriangle size={12}/> {unassigned.length} unassigned</Chip>}
        </div>
      </div>

      <WeekBar selectedDay={selectedDay} onSelect={setSelectedDay}/>

      {creators.length === 0 ? (
        <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:60, textAlign:'center' }}>
          <p style={{ color:'var(--fg-3)', fontSize:14, marginBottom:12 }}>No creators yet</p>
          <p style={{ color:'var(--fg-3)', fontSize:12 }}>Go to Settings → add your creators first.</p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:16, marginBottom:24 }}>
          {creators.map(cr => (
            <DraggableCreatorWrap key={cr.id} creator={cr} draggingType={draggingType}>
              <CreatorCard creator={cr} chatters={chatters}
                shifts={shifts.filter(s => s.creator_id === cr.id)}
                onAssign={handleOpenAssign} onClickChatter={handleClickChatter}
                onRemove={handleRemove} onSplit={handleSplit}
                onRename={c => setRenameTarget(c)} onDeactivate={handleDeactivate}
                mergedCreators={mergedMap[cr.id] || []}
                onManageShifts={() => setShiftsCreatorId(cr.id)}
                selectedDay={selectedDay} overtimeList={overtimeList} draggingType={draggingType}/>
            </DraggableCreatorWrap>
          ))}
        </div>
      )}

      {unassigned.length > 0 && (
        <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
          <PanelHeader title="Unassigned chatters" sub={`${unassigned.length} not assigned`} right={<Chip tone="warn">{unassigned.length}</Chip>}/>
          <div style={{ padding:12, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:8 }}>
            {unassigned.map(ch => (
              <DraggableChatter key={ch.id} chatter={ch}>
                <ChatterRow chatter={ch} onClick={() => handleClickChatter(ch)}/>
              </DraggableChatter>
            ))}
          </div>
        </div>
      )}

      {assignTarget && <AssignModal chatters={chatters} shifts={shifts} creators={creators}
        targetCreatorId={assignTarget.creatorId} targetShiftId={assignTarget.shiftId}
        onAssign={handleAssign} onClose={() => setAssignTarget(null)}/>}

      {mergePrompt && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={() => setMergePrompt(null)}>
          <div style={{ width:420, background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
            <PanelHeader title="Merge Creators" sub="Reversible via Split in the ··· menu"/>
            <div style={{ padding:20 }}>
              <p style={{ fontSize:13, color:'var(--fg-1)', marginBottom:16, lineHeight:1.5 }}>
                Merge <strong>{creators.find(c => c.id === mergePrompt.sourceId)?.name}</strong> into{' '}
                <strong>{creators.find(c => c.id === mergePrompt.targetId)?.name}</strong>?
              </p>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button className="btn sm ghost" onClick={() => setMergePrompt(null)}>Cancel</button>
                <button className="btn sm" style={{ background:'var(--indigo)', color:'#fff' }} onClick={confirmMerge}>Merge</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {renameTarget && <RenameModal creator={renameTarget} onSave={handleRename} onClose={() => setRenameTarget(null)}/>}
      {shiftsCreatorId && <ShiftsModal
        shifts={shifts.filter(s => s.creator_id === shiftsCreatorId)}
        creatorId={shiftsCreatorId}
        onSave={handleSaveShifts}
        onDelete={handleDeleteShift}
        onCreate={handleCreateShift}
        onClose={() => setShiftsCreatorId(null)}/>}
    </div>

    <DragOverlay dropAnimation={null}>
      {activeChatter ? (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
          background:'var(--bg-1)', border:'2px solid var(--indigo-bright)', borderRadius:'var(--r-tile)',
          boxShadow:'0 8px 24px rgba(0,0,0,0.25)', cursor:'grabbing', width: 220 }}>
          <Avatar name={activeChatter.name} size={28}/>
          <div style={{ fontSize:12.5, fontWeight:600 }}>{activeChatter.name}</div>
        </div>
      ) : null}
    </DragOverlay>
    </DndContext>
  );
}
