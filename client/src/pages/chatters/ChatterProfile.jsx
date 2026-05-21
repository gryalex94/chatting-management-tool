import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Avatar, Chip, PriorityDot, StatusDot } from '../../components/shared';
import { STATUS_META, fmtTimer } from '../../utils/helpers';
import {
  ArrowLeft, Plus, AlertTriangle, Check, Clock, Eye, Camera,
  ChevronDown, Star, MessageSquare, TrendingUp, TrendingDown
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ─── KPI Cell ───────────────────────────────────── */
function KPI({ label, value, sub, tone }) {
  const colors = { good:'#4ade80', bad:'#f87171', warn:'#fbbf24', info:'#60a5fa', neutral:'var(--fg-2)' };
  return (
    <div style={{ flex:1, textAlign:'center', padding:'12px 8px', borderRight:'1px solid var(--border-soft)' }}>
      <div className="mono" style={{ fontSize:20, fontWeight:600, color:tone?colors[tone]:'var(--fg-0)' }}>{value}</div>
      <div style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:2 }}>{label}</div>
      {sub&&<div style={{ fontSize:10, color:colors[tone]||'var(--fg-3)', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

/* ─── Metric Chart Placeholder ───────────────────── */
function MiniChart({ title, value, trend, color = 'var(--indigo)', data = [] }) {
  const max = Math.max(...data, 1);
  const h = 80;
  const w = 280;
  const points = data.map((v, i) => `${(i/(data.length-1))*w},${h - (v/max)*h}`).join(' ');

  return (
    <div style={{ flex:1 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
        <span style={{ fontSize:12, color:'var(--fg-2)' }}>{title}</span>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span className="mono" style={{ fontSize:16, fontWeight:600 }}>{value}</span>
          {trend&&<span style={{ fontSize:11, color:trend.startsWith('↑')||trend.startsWith('↓ improving')?'#4ade80':'#f87171', fontWeight:500 }}>{trend}</span>}
        </div>
      </div>
      {data.length>1&&(
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow:'visible' }}>
          <defs>
            <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
              <stop offset="100%" stopColor={color} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#grad-${title})`}/>
          <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          {data.length>0&&<circle cx={w} cy={h-(data[data.length-1]/max)*h} r="3" fill={color}/>}
        </svg>
      )}
    </div>
  );
}

/* ─── Mistake Entry ──────────────────────────────── */
const CATEGORY_COLORS = {
  long_response_time:'#f59e0b', poor_selling_pushy:'#ef4444', poor_selling_soft:'#ef4444',
  missing_notes:'#8b5cf6', afk_issue:'#f97316', script_quality:'#a855f7',
  not_adding_to_lists:'#3b82f6', poor_price_development:'#ef4444', poor_price_negotiation:'#ef4444',
  lack_of_aftercare:'#f59e0b', poor_horny_talk:'#f97316', poor_shift_handover:'#8b5cf6', other:'#6c6c84',
};

function MistakeEntry({ m }) {
  const color = CATEGORY_COLORS[m.category] || 'var(--fg-3)';
  const label = m.category?.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  return (
    <div style={{ padding:'12px 0', borderBottom:'1px solid var(--border-soft)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
        <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em', padding:'2px 6px', borderRadius:4, background:`${color}20`, color }}>{label}</span>
        <span className="mono" style={{ fontSize:10, color:'var(--fg-3)' }}>{new Date(m.created_at).toLocaleDateString()}</span>
      </div>
      {m.description&&<div style={{ fontSize:12, color:'var(--fg-1)', lineHeight:1.5, marginTop:4 }}>{m.description}</div>}
      {m.users?.name&&<div style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:4 }}>logged by {m.users.name}</div>}
    </div>
  );
}

/* ─── Review Entry ───────────────────────────────── */
function ReviewEntry({ r }) {
  return (
    <div style={{ padding:'12px 0', borderBottom:'1px solid var(--border-soft)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <span className="mono" style={{ fontSize:10.5, color:'var(--fg-3)' }}>{new Date(r.created_at).toLocaleDateString()}</span>
        <span style={{ fontSize:10.5, color:'var(--fg-3)' }}>by {r.users?.name||'—'}</span>
      </div>
      <div style={{ fontSize:12, color:'var(--fg-1)', lineHeight:1.5 }}>"{r.notes}"</div>
    </div>
  );
}

/* ─── Attachment Tile ────────────────────────────── */
function AttachmentTile({ a }) {
  const isGood = a.attachment_type === 'good_case';
  return (
    <div style={{
      background:'var(--bg-3)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)',
      overflow:'hidden', cursor:'pointer', transition:'border-color .12s',
    }}
    onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-strong)'}
    onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
      <div style={{
        height:80, display:'flex', alignItems:'center', justifyContent:'center',
        background: isGood ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
        position:'relative',
      }}>
        <Chip tone={isGood?'good':'bad'} style={{position:'absolute',top:6,left:6,height:18,fontSize:9.5}}>
          {isGood?'GOOD':'BAD'}
        </Chip>
        <Camera size={20} style={{color:'var(--fg-3)',opacity:0.5}}/>
      </div>
      <div style={{ padding:'8px 10px' }}>
        <div style={{ fontSize:11, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.label||'Screenshot'}</div>
        <div style={{ fontSize:10, color:'var(--fg-3)', marginTop:2 }}>{new Date(a.created_at).toLocaleDateString()}</div>
      </div>
    </div>
  );
}

/* ─── Add Mistake Modal ──────────────────────────── */
function AddMistakeModal({ chatterId, onClose, onSaved }) {
  const [category, setCategory] = useState('long_response_time');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const categories = Object.keys(CATEGORY_COLORS);
  const inp = { width:'100%', padding:'8px 12px', borderRadius:'var(--r-btn)', fontSize:12.5, outline:'none', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)' };

  async function save(e) {
    e.preventDefault(); setSaving(true);
    try { await api.post(`/api/chatters/${chatterId}/mistakes`, { category, description }); toast.success('Mistake logged'); onSaved(); onClose(); }
    catch { toast.error('Failed'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={onClose}>
      <div style={{width:420,background:'var(--bg-1)',border:'1px solid var(--border)',borderRadius:'var(--r-panel)',padding:20}} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Log Mistake</h3>
        <form onSubmit={save} style={{display:'flex',flexDirection:'column',gap:12}}>
          <div>
            <label className="label" style={{display:'block',marginBottom:6}}>Category</label>
            <select value={category} onChange={e=>setCategory(e.target.value)} style={inp}>
              {categories.map(c=><option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{display:'block',marginBottom:6}}>Description</label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} style={{...inp,resize:'vertical'}} placeholder="What happened..."/>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving?'Saving...':'Log mistake'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Add Review Modal ───────────────────────────── */
function AddReviewModal({ chatterId, onClose, onSaved }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const inp = { width:'100%', padding:'8px 12px', borderRadius:'var(--r-btn)', fontSize:12.5, outline:'none', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)' };

  async function save(e) {
    e.preventDefault(); setSaving(true);
    try { await api.post(`/api/chatters/${chatterId}/reviews`, { notes }); toast.success('Review logged'); onSaved(); onClose(); }
    catch { toast.error('Failed'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={onClose}>
      <div style={{width:420,background:'var(--bg-1)',border:'1px solid var(--border)',borderRadius:'var(--r-panel)',padding:20}} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontSize:14,fontWeight:600,marginBottom:14}}>Add Performance Review</h3>
        <form onSubmit={save} style={{display:'flex',flexDirection:'column',gap:12}}>
          <div>
            <label className="label" style={{display:'block',marginBottom:6}}>Review Notes</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4} required style={{...inp,resize:'vertical'}} placeholder="Performance observations, coaching points..."/>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving?'Saving...':'Save review'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Profile Page ──────────────────────────── */
export default function ChatterProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chatter, setChatter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMistakeModal, setShowMistakeModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/chatters/${id}`);
      setChatter(data);
    } catch (err) { console.error(err); toast.error('Failed to load profile'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(newStatus) {
    try {
      await api.put(`/api/chatters/${id}`, { status: newStatus });
      toast.success('Status updated');
      setStatusOpen(false);
      load();
    } catch { toast.error('Failed'); }
  }

  async function addPenalty() {
    const desc = prompt('Penalty description:');
    if (!desc) return;
    try { await api.post(`/api/chatters/${id}/penalties`, { description: desc }); toast.success('Penalty added'); load(); }
    catch { toast.error('Failed'); }
  }

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', paddingTop:80 }}>
      <div style={{ width:24, height:24, border:'2px solid var(--indigo)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .6s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!chatter) return <div style={{ padding:40, textAlign:'center', color:'var(--fg-3)' }}>Chatter not found</div>;

  const meta = STATUS_META[chatter.status] || STATUS_META.new;
  const assignments = chatter.chatter_creator_assignments?.filter(a => a.is_active) || [];
  const creatorNames = assignments.map(a => a.creators?.name).filter(Boolean).join(', ') || '—';
  const shiftName = assignments[0]?.shifts?.name || '—';
  const shiftHours = assignments[0]?.shifts ? `${assignments[0].shifts.start_time?.slice(0,5)} – ${assignments[0].shifts.end_time?.slice(0,5)}` : '';

  const mistakes = chatter.mistakes || [];
  const penalties = chatter.penalties || [];
  const reviews = chatter.reviews || [];
  const attachments = chatter.attachments || [];
  const metrics = chatter.latestMetrics || [];

  // Build chart data from metrics
  const salesData = metrics.map(m => parseFloat(m.sales_today) || 0).reverse();
  const responseData = metrics.map(m => m.response_time_avg_seconds || 0).reverse();
  const latestMetric = metrics[0] || {};

  const goodCases = attachments.filter(a => a.attachment_type === 'good_case');
  const badCases = attachments.filter(a => a.attachment_type === 'bad_case');

  // Repeated mistake detection
  const mistakeCounts = {};
  mistakes.forEach(m => { mistakeCounts[m.category] = (mistakeCounts[m.category] || 0) + 1; });
  const repeated = Object.entries(mistakeCounts).filter(([_, c]) => c >= 3);

  return (
    <div className="animate-in">
      {/* Back nav */}
      <button className="btn ghost sm" onClick={() => navigate(-1)} style={{ marginBottom:12, color:'var(--fg-3)' }}>
        <ArrowLeft size={14}/> Back
      </button>

      {/* Header */}
      <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden', marginBottom:16 }}>
        <div style={{ padding:'20px 20px 16px', display:'flex', alignItems:'center', gap:16 }}>
          <Avatar name={chatter.name} size={56}/>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <h1 style={{ fontSize:24, fontWeight:700, color:meta.nameColor }}>{chatter.name}</h1>
              {/* Status dropdown */}
              <div style={{ position:'relative' }}>
                <button onClick={() => setStatusOpen(!statusOpen)}
                  style={{
                    display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:999,
                    background:`${meta.color}20`, color:meta.nameColor, border:`1px solid ${meta.color}40`,
                    fontSize:11.5, fontWeight:500, cursor:'pointer',
                  }}>
                  {meta.label} <ChevronDown size={12}/>
                </button>
                {statusOpen && (
                  <div style={{ position:'absolute', top:'100%', left:0, marginTop:4, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', zIndex:10, minWidth:140, boxShadow:'var(--shadow-raised)' }}>
                    {Object.entries(STATUS_META).map(([k, v]) => (
                      <button key={k} onClick={() => changeStatus(k)}
                        style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', width:'100%', border:'none', background:chatter.status===k?'var(--bg-3)':'transparent', color:'var(--fg-0)', fontSize:12, cursor:'pointer', textAlign:'left' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--bg-3)'} onMouseLeave={e=>e.currentTarget.style.background=chatter.status===k?'var(--bg-3)':'transparent'}>
                        <StatusDot status={k}/> {v.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display:'flex', gap:12, marginTop:6, fontSize:12, color:'var(--fg-2)' }}>
              <span>⊙ {creatorNames}</span>
              <span>◷ {shiftName} {shiftHours}</span>
              <span>joined {new Date(chatter.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button className="btn" onClick={() => setShowMistakeModal(true)}><AlertTriangle size={13}/> Log mistake</button>
            <button className="btn" onClick={() => setShowReviewModal(true)}><Check size={13}/> Add review</button>
            <button className="btn" onClick={addPenalty}><Star size={13}/> Add penalty</button>
            <button className="btn primary"><Plus size={13}/> Task</button>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display:'flex', borderTop:'1px solid var(--border)', background:'var(--bg-2)' }}>
          <KPI label="Sales yesterday" value={`$${latestMetric.sales_today||0}`} tone={parseFloat(latestMetric.sales_today_vs_avg_pct)>0?'good':'bad'} sub={latestMetric.sales_today_vs_avg_pct?`${latestMetric.sales_today_vs_avg_pct>0?'+':''}${latestMetric.sales_today_vs_avg_pct}%`:null}/>
          <KPI label="7-day avg" value={`$${latestMetric.sales_7day_avg||0}`}/>
          <KPI label="Avg response" value={`${latestMetric.response_time_avg_seconds||'—'}s`} tone="info"/>
          <KPI label="Golden ratio" value={latestMetric.golden_ratio||'—'} tone={parseFloat(latestMetric.golden_ratio)<0.65?'bad':'neutral'}/>
          <KPI label="Unlock rate" value={`${latestMetric.unlock_rate||'—'}%`} tone="warn"/>
          <KPI label="Last review" value={reviews.length>0?`${Math.floor((Date.now()-new Date(reviews[0].created_at))/(86400000))}d`:'never'} tone="neutral"/>
          <KPI label="Mistakes (30d)" value={mistakes.filter(m=>new Date(m.created_at)>new Date(Date.now()-30*86400000)).length} tone={mistakes.length>3?'bad':'neutral'}/>
          <KPI label="Screenshots" value={attachments.length} sub={`${goodCases.length} good · ${badCases.length} bad`}/>
        </div>
      </div>

      {/* Repeated mistakes warning */}
      {repeated.length > 0 && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:'var(--r-card)', padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
          <AlertTriangle size={16} style={{ color:'var(--bad)' }}/>
          <div style={{ fontSize:12.5, color:'#f87171' }}>
            Repeated issues: {repeated.map(([cat, count]) => `${cat.replace(/_/g,' ')} (×${count})`).join(', ')}
          </div>
        </div>
      )}

      {/* Two-column body */}
      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:16 }}>
        {/* Left */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Metrics charts */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <span style={{ fontWeight:600, fontSize:13.5 }}>Metrics — last {metrics.length} days</span>
              <div style={{ display:'flex', gap:4 }}>
                <button className="btn sm primary">14d</button>
                <button className="btn sm">30d</button>
                <button className="btn sm">90d</button>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <MiniChart title="Daily sales" value={`$${latestMetric.sales_today||0}`} trend={parseFloat(latestMetric.sales_today_vs_avg_pct)>0?'↑ trending':null} color="var(--indigo-bright)" data={salesData}/>
              <MiniChart title="Avg response time" value={`${latestMetric.response_time_avg_seconds||0}s`} trend={latestMetric.response_time_trend==='improving'?'↓ improving':null} color="#4ade80" data={responseData}/>
            </div>
          </div>

          {/* Open tasks */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
              <span style={{ fontWeight:600, fontSize:13.5 }}>Open tasks</span>
              <div style={{ flex:1 }}/>
              <button className="btn sm"><Plus size={12}/> Add task</button>
            </div>
            <div style={{ padding:8 }}>
              {/* Placeholder — in production, filter tasks by this chatter */}
              <div style={{ padding:20, textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>
                Tasks for this chatter will appear here once created or auto-generated.
              </div>
            </div>
          </div>

          {/* Coaching dossier */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
              <span style={{ fontWeight:600, fontSize:13.5 }}>Coaching dossier</span>
              <div style={{ flex:1 }}/>
              <Chip tone="good">{goodCases.length} good</Chip>
              <Chip tone="bad">{badCases.length} bad</Chip>
            </div>
            <div style={{ padding:12 }}>
              {attachments.length === 0 ? (
                <div style={{ padding:20, textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>
                  No screenshots yet. Complete tasks with proof-of-work to build the dossier.
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
                  {attachments.slice(0, 9).map(a => <AttachmentTile key={a.id} a={a}/>)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Mistake log */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
              <span style={{ fontWeight:600, fontSize:13.5 }}>Mistake log</span>
              <span style={{ fontSize:11, color:'var(--fg-3)' }}>{mistakes.length} entries</span>
              <div style={{ flex:1 }}/>
              <button className="btn sm" onClick={() => setShowMistakeModal(true)}><Plus size={12}/> Log mistake</button>
            </div>
            <div style={{ padding:'4px 16px', maxHeight:300, overflow:'auto' }}>
              {mistakes.length === 0 ? (
                <div style={{ padding:20, textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>No mistakes logged yet.</div>
              ) : mistakes.map(m => <MistakeEntry key={m.id} m={m}/>)}
            </div>
          </div>

          {/* Performance reviews */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
              <span style={{ fontWeight:600, fontSize:13.5 }}>Performance reviews</span>
              <span style={{ fontSize:11, color:'var(--fg-3)' }}>Last {reviews.length}</span>
              <div style={{ flex:1 }}/>
              <button className="btn sm" onClick={() => setShowReviewModal(true)}><Plus size={12}/> Add review</button>
            </div>
            <div style={{ padding:'4px 16px', maxHeight:250, overflow:'auto' }}>
              {reviews.length === 0 ? (
                <div style={{ padding:20, textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>No reviews yet.</div>
              ) : reviews.map(r => <ReviewEntry key={r.id} r={r}/>)}
            </div>
          </div>

          {/* Penalties */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
              <span style={{ fontWeight:600, fontSize:13.5 }}>Penalties</span>
              <div style={{ flex:1 }}/>
              <button className="btn sm" onClick={addPenalty}><Plus size={12}/> Add penalty</button>
            </div>
            <div style={{ padding:'4px 16px' }}>
              {penalties.length === 0 ? (
                <div style={{ padding:16, textAlign:'center', color:'var(--fg-3)', fontSize:12, border:'1px dashed var(--border)', borderRadius:'var(--r-tile)', margin:8 }}>
                  No active or historical penalties.
                </div>
              ) : penalties.map(p => (
                <div key={p.id} style={{ padding:'10px 0', borderBottom:'1px solid var(--border-soft)' }}>
                  <div className="mono" style={{ fontSize:10.5, color:'var(--fg-3)' }}>{new Date(p.created_at).toLocaleDateString()}</div>
                  <div style={{ fontSize:12, color:'var(--fg-1)', marginTop:4 }}>{p.description}</div>
                  {p.users?.name&&<div style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:2 }}>by {p.users.name}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showMistakeModal && <AddMistakeModal chatterId={id} onClose={() => setShowMistakeModal(false)} onSaved={load}/>}
      {showReviewModal && <AddReviewModal chatterId={id} onClose={() => setShowReviewModal(false)} onSaved={load}/>}
    </div>
  );
}
