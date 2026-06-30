import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Avatar, Chip, StatusDot } from '../../components/shared';
import { STATUS_META } from '../../utils/helpers';
import {
  ArrowLeft, Plus, AlertTriangle, Check, Clock, Eye,
  ChevronDown, Star, MessageSquare, TrendingUp, TrendingDown, Calendar,
  Zap, Shield, DollarSign, Brain, Activity, Users, BarChart3, Flag, Gift
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ─── Constants ──────────────────────────────────── */
const CATEGORY_COLORS = {
  long_response_time:'#f59e0b', poor_selling_pushy:'#ef4444', poor_selling_soft:'#ef4444',
  missing_notes:'#8b5cf6', afk_issue:'#f97316', script_quality:'#a855f7',
  not_adding_to_lists:'#3b82f6', poor_price_development:'#ef4444', poor_price_negotiation:'#ef4444',
  lack_of_aftercare:'#f59e0b', poor_horny_talk:'#f97316', poor_shift_handover:'#8b5cf6', other:'#6c6c84',
};

function goldenColor(val) {
  const v = parseFloat(val) || 0;
  if (v <= 2) return '#f87171';
  if (v <= 4) return '#fbbf24';
  if (v <= 8) return '#4ade80';
  if (v <= 10) return '#fbbf24';
  return '#f87171';
}

function unlockColor(val) {
  const v = parseFloat(val) || 0;
  if (v <= 20) return '#f87171';
  if (v <= 39) return '#fbbf24';
  if (v <= 60) return '#4ade80';
  if (v <= 80) return '#fbbf24';
  return '#f87171';
}

/* ═══ TOP ZONE ═══════════════════════════════════ */

function AIScoreCard({ icon: Icon, label, score, trend, color }) {
  const scoreColor = score >= 7 ? '#4ade80' : score >= 5 ? '#fbbf24' : score > 0 ? '#f87171' : 'var(--fg-3)';
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendColor = trend === 'up' ? '#4ade80' : trend === 'down' ? '#f87171' : 'var(--fg-3)';
  return (
    <div style={{ flex:1, padding:'14px 16px', background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-card)', display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ width:36, height:36, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', background:`${color}15`, color }}><Icon size={18}/></div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:10.5, color:'var(--fg-3)', marginBottom:2 }}>{label}</div>
        <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
          <span className="mono" style={{ fontSize:22, fontWeight:700, color:scoreColor }}>{score > 0 ? score.toFixed(1) : '—'}</span>
          {score > 0 && <span style={{ fontSize:11, color:trendColor, fontWeight:600 }}>{trendIcon}</span>}
        </div>
      </div>
    </div>
  );
}

function AlertsBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:'var(--r-card)', padding:'10px 16px', display:'flex', flexDirection:'column', gap:6 }}>
      {alerts.map((a, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5 }}>
          <span style={{ fontSize:10 }}>{a.severity === 'high' ? '🔴' : '🟡'}</span>
          <span style={{ color: a.severity === 'high' ? '#f87171' : '#fbbf24' }}>{a.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ MIDDLE ZONE ════════════════════════════════ */

function KPI({ label, value, sub, color }) {
  return (
    <div style={{ flex:1, textAlign:'center', padding:'12px 6px', borderRight:'1px solid var(--border-soft)' }}>
      <div className="mono" style={{ fontSize:18, fontWeight:600, color: color || 'var(--fg-0)' }}>{value}</div>
      <div style={{ fontSize:10, color:'var(--fg-3)', marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:9.5, color: color || 'var(--fg-3)', marginTop:1 }}>{sub}</div>}
    </div>
  );
}

function AIDailySummary({ summary }) {
  return (
    <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:'14px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <Brain size={14} style={{ color:'var(--indigo-bright)' }}/>
        <span style={{ fontWeight:600, fontSize:13 }}>AI Daily Summary</span>
      </div>
      {summary
        ? <p style={{ fontSize:12.5, color:'var(--fg-1)', lineHeight:1.65, margin:0 }}>{summary}</p>
        : <p style={{ fontSize:12, color:'var(--fg-3)', margin:0, fontStyle:'italic' }}>AI analysis will appear here once the daily analysis engine is connected.</p>
      }
    </div>
  );
}

function PageContribution({ stats, allStats, timeframe, setTimeframe }) {
  const active = (stats || []).filter(s => (s.messages_sent || 0) > 0 || parseFloat(s.sales) > 0);

  // For 7d/30d, aggregate per page
  let rows = active;
  if (timeframe !== '1d' && allStats) {
    const days = timeframe === '7d' ? 7 : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const filtered = allStats.filter(s => s.report_date >= cutoffStr && ((s.messages_sent || 0) > 0 || parseFloat(s.sales) > 0));

    const grouped = {};
    filtered.forEach(s => {
      const key = s.creator_name || 'Unknown';
      if (!grouped[key]) grouped[key] = { creator_name: key, sales: 0, messages_sent: 0, fans_chatted: 0, ppvs_sent: 0, ppvs_unlocked: 0, fans_who_spent: 0, days: 0 };
      const g = grouped[key];
      g.sales += parseFloat(s.sales) || 0;
      g.messages_sent += s.messages_sent || 0;
      g.fans_chatted += s.fans_chatted || 0;
      g.ppvs_sent += s.ppvs_sent || 0;
      g.ppvs_unlocked += s.ppvs_unlocked || 0;
      g.fans_who_spent += s.fans_who_spent || 0;
      g.days++;
    });

    rows = Object.values(grouped).map(g => ({
      creator_name: g.creator_name,
      sales: g.sales.toFixed(2),
      messages_sent: g.messages_sent,
      fans_chatted: g.fans_chatted,
      golden_ratio: g.messages_sent > 0 ? ((g.ppvs_sent / g.messages_sent) * 100).toFixed(1) : '0.0',
      unlock_rate: g.ppvs_sent > 0 ? ((g.ppvs_unlocked / g.ppvs_sent) * 100).toFixed(0) : '0',
      fan_cvr: g.fans_chatted > 0 ? ((g.fans_who_spent / g.fans_chatted) * 100).toFixed(0) : '0',
      _days: g.days,
    }));
  }

  if (rows.length === 0) return null;

  return (
    <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
        <BarChart3 size={14} style={{ color:'var(--fg-3)' }}/>
        <span style={{ fontWeight:600, fontSize:13 }}>Per-Page Contribution</span>
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', gap:4 }}>
          {['1d','7d','30d'].map(tf => (
            <button key={tf} className={`btn sm ${timeframe === tf ? 'primary' : ''}`}
              onClick={() => setTimeframe(tf)} style={{ fontSize:10, padding:'3px 8px' }}>{tf}</button>
          ))}
        </div>
      </div>
      <div style={{ overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'var(--bg-2)' }}>
              {['Page','Sales','Msgs','Fans','Golden','Unlock','Fan CVR'].map(h => (
                <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.sort((a,b) => parseFloat(b.sales) - parseFloat(a.sales)).map((s,i) => (
              <tr key={i} style={{ borderBottom:'1px solid var(--border-soft)' }}>
                <td style={{ padding:'10px 12px', fontWeight:500 }}>{s.creator_name || '—'}</td>
                <td style={{ padding:'10px 12px' }} className="mono">${parseFloat(s.sales||0).toFixed(0)}</td>
                <td style={{ padding:'10px 12px' }} className="mono">{s.messages_sent||0}</td>
                <td style={{ padding:'10px 12px' }} className="mono">{s.fans_chatted||0}</td>
                <td className="mono" style={{ padding:'10px 12px', color:goldenColor(s.golden_ratio) }}>{parseFloat(s.golden_ratio||0).toFixed(1)}%</td>
                <td style={{ padding:'10px 12px', color:unlockColor(s.unlock_rate) }} className="mono">{parseFloat(s.unlock_rate||0).toFixed(0)}%</td>
                <td style={{ padding:'10px 12px' }} className="mono">{parseFloat(s.fan_cvr||0).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══ BOTTOM ZONE ════════════════════════════════ */

function SalesChart({ data, label, color }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const h = 90, w = 300;
  const points = data.map((v,i) => `${(i/(data.length-1))*w},${h-(v/max)*h}`).join(' ');
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8 }}>
        <span style={{ fontSize:12, color:'var(--fg-2)' }}>{label}</span>
        <span className="mono" style={{ fontSize:16, fontWeight:600 }}>${data[data.length-1]?.toFixed(0) || 0}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow:'visible' }}>
        <defs>
          <linearGradient id={`grad-${label.replace(/\s/g,'')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#grad-${label.replace(/\s/g,'')})`}/>
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={w} cy={h-(data[data.length-1]/max)*h} r="3" fill={color}/>
      </svg>
    </div>
  );
}

function MistakePatterns({ mistakes }) {
  if (!mistakes || mistakes.length === 0) return null;
  const counts = {};
  const recent = {};
  const now = Date.now();
  mistakes.forEach(m => {
    counts[m.category] = (counts[m.category]||0) + 1;
    if (now - new Date(m.created_at).getTime() < 7*86400000) recent[m.category] = (recent[m.category]||0) + 1;
  });
  const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  return (
    <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
        <Flag size={14} style={{ color:'var(--fg-3)' }}/>
        <span style={{ fontWeight:600, fontSize:13 }}>Mistake Patterns</span>
      </div>
      <div style={{ padding:'8px 16px' }}>
        {sorted.map(([cat, total]) => {
          const thisWeek = recent[cat]||0;
          const color = CATEGORY_COLORS[cat]||'var(--fg-3)';
          const label = cat.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
          return (
            <div key={cat} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border-soft)' }}>
              <div style={{ width:4, height:28, borderRadius:2, background:color }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:500 }}>{label}</div>
                <div style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:1 }}>{total} total · {thisWeek} this week</div>
              </div>
              {thisWeek >= 2 && <Chip tone="bad" style={{ fontSize:9.5 }}>ESCALATING</Chip>}
              {total >= 3 && thisWeek < 2 && <Chip tone="warn" style={{ fontSize:9.5 }}>REPEATED</Chip>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MistakeEntry({ m }) {
  const color = CATEGORY_COLORS[m.category]||'var(--fg-3)';
  const label = m.category?.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  return (
    <div style={{ padding:'12px 0', borderBottom:'1px solid var(--border-soft)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
        <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em', padding:'2px 6px', borderRadius:4, background:`${color}20`, color }}>{label}</span>
        <span className="mono" style={{ fontSize:10, color:'var(--fg-3)' }}>{new Date(m.created_at).toLocaleDateString()}</span>
      </div>
      {m.description && <div style={{ fontSize:12, color:'var(--fg-1)', lineHeight:1.5, marginTop:4 }}>{m.description}</div>}
      {m.users?.name && <div style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:4 }}>logged by {m.users.name}</div>}
    </div>
  );
}

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

/* ─── Penalty/Bonus Modal ────────────────────────── */
function PenaltyModal({ chatterId, onClose, onSaved }) {
  const [type, setType] = useState('penalty');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const inp = { width:'100%', padding:'8px 12px', borderRadius:'var(--r-btn)', fontSize:12.5, outline:'none', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)' };

  async function save(e) {
    e.preventDefault(); setSaving(true);
    try {
      await api.post(`/api/chatters/${chatterId}/penalties`, {
        description, penalty_type: type, amount: amount ? parseFloat(amount) : null,
      });
      toast.success(type === 'penalty' ? 'Penalty issued' : 'Bonus added');
      onSaved(); onClose();
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  }

  const isPenalty = type === 'penalty';

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ width:420, background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:20 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize:14, fontWeight:600, marginBottom:14 }}>Add Penalty or Bonus</h3>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Type toggle */}
          <div style={{ display:'flex', gap:8 }}>
            <button type="button" onClick={() => setType('penalty')}
              style={{ flex:1, padding:'10px 0', borderRadius:'var(--r-btn)', cursor:'pointer', fontSize:13, fontWeight:600, border: isPenalty ? '2px solid #f87171' : '2px solid var(--border)', background: isPenalty ? 'rgba(248,113,113,0.1)' : 'var(--bg-2)', color: isPenalty ? '#f87171' : 'var(--fg-3)' }}>
              ⚠ Penalty
            </button>
            <button type="button" onClick={() => setType('bonus')}
              style={{ flex:1, padding:'10px 0', borderRadius:'var(--r-btn)', cursor:'pointer', fontSize:13, fontWeight:600, border: !isPenalty ? '2px solid #4ade80' : '2px solid var(--border)', background: !isPenalty ? 'rgba(74,222,128,0.1)' : 'var(--bg-2)', color: !isPenalty ? '#4ade80' : 'var(--fg-3)' }}>
              ★ Bonus
            </button>
          </div>
          <div>
            <label className="label" style={{ display:'block', marginBottom:6 }}>Amount ($) — optional</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} style={inp} placeholder="e.g. 25.00"/>
          </div>
          <div>
            <label className="label" style={{ display:'block', marginBottom:6 }}>What for?</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} required style={{ ...inp, resize:'vertical' }} placeholder={isPenalty ? "Reason for penalty..." : "Reason for bonus..."}/>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving...' : isPenalty ? 'Issue penalty' : 'Give bonus'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Weekly Schedule ────────────────────────────── */
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_NUMBERS = [1,2,3,4,5,6,7];

function WeeklySchedule({ chatterId, chatterName, workDays, assignments, onUpdate }) {
  const days = workDays || [1,2,3,4,5];
  const [overtime, setOvertime] = useState([]);
  const [coworkers, setCoworkers] = useState([]);
  const [expandedDay, setExpandedDay] = useState(null);

  useEffect(() => {
    api.get(`/api/chatters/${chatterId}/overtime`).then(r => setOvertime(r.data||[])).catch(()=>{});
    api.get('/api/chatters').then(r => setCoworkers((r.data||[]).filter(c => c.id !== chatterId))).catch(()=>{});
  }, [chatterId]);

  async function toggle(dayNum) {
    const updated = days.includes(dayNum) ? days.filter(d=>d!==dayNum) : [...days,dayNum].sort();
    try { await api.put(`/api/chatters/${chatterId}`, { work_days: updated }); toast.success('Schedule updated'); onUpdate(); }
    catch { toast.error('Failed'); }
  }
  async function addOvertime(coverChatterId, dayOfWeek, type) {
    try {
      await api.post(`/api/chatters/${coverChatterId}/overtime`, { dayOfWeek, overtimeType:type, coveringFor:chatterId });
      toast.success('Overtime assigned');
      const r = await api.get(`/api/chatters/${chatterId}/overtime`);
      setOvertime(r.data||[]);
    } catch(err) { toast.error(err.response?.data?.error||'Failed'); }
  }
  async function removeOvertime(otId) {
    try {
      const ot = overtime.find(o=>o.id===otId);
      await api.delete(`/api/chatters/${ot?.chatter_id||chatterId}/overtime/${otId}`);
      toast.success('Overtime removed');
      setOvertime(prev=>prev.filter(o=>o.id!==otId));
    } catch { toast.error('Failed'); }
  }

  const creatorIds = (assignments||[]).map(a=>a.creator_id||a.creators?.id).filter(Boolean);
  const relevantCoworkers = coworkers.filter(cw=>cw.chatter_creator_assignments?.some(a=>a.is_active&&creatorIds.includes(a.creator_id)));
  const coveringForMe = overtime.filter(o=>o.covering_for===chatterId);
  const overtimeByDay = {};
  coveringForMe.forEach(o => { if(!overtimeByDay[o.day_of_week]) overtimeByDay[o.day_of_week]=[]; overtimeByDay[o.day_of_week].push(o); });
  const offDays = DAY_NUMBERS.filter(d=>!days.includes(d));

  return (
    <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
        <Calendar size={14} style={{ color:'var(--fg-3)' }}/>
        <span style={{ fontWeight:600, fontSize:13 }}>Weekly Schedule</span>
        <div style={{ flex:1 }}/>
        <span style={{ fontSize:11, color:'var(--fg-3)' }}>{days.length} days/week</span>
      </div>
      <div style={{ padding:16 }}>
        <div style={{ display:'flex', gap:6, marginBottom:offDays.length>0?12:0 }}>
          {DAY_LABELS.map((label,i) => {
            const dayNum=DAY_NUMBERS[i], active=days.includes(dayNum), hasOT=overtimeByDay[dayNum]?.length>0;
            return (
              <button key={dayNum} onClick={()=>toggle(dayNum)} style={{
                flex:1, padding:'10px 0', borderRadius:'var(--r-tile)', cursor:'pointer',
                border:active?'2px solid var(--indigo-bright)':hasOT?'2px solid var(--warn)':'2px solid var(--border)',
                background:active?'var(--indigo-soft)':'var(--bg-2)', color:active?'var(--indigo-bright)':'var(--fg-3)',
                fontWeight:active?700:500, fontSize:12, textAlign:'center', transition:'all .12s', position:'relative',
              }}>
                {label}
                {!active&&hasOT&&<div style={{ position:'absolute',top:-4,right:-4,width:8,height:8,borderRadius:'50%',background:'var(--warn)',border:'2px solid var(--bg-1)' }}/>}
              </button>
            );
          })}
        </div>
        {offDays.length>0&&(
          <div>
            <div className="label" style={{ fontSize:10, marginBottom:8 }}>Days off — overtime coverage</div>
            {offDays.map(dayNum => {
              const dayOTs=overtimeByDay[dayNum]||[], exp=expandedDay===dayNum;
              return (
                <div key={dayNum} style={{ background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)', marginBottom:8, overflow:'hidden' }}>
                  <div onClick={()=>setExpandedDay(exp?null:dayNum)} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', cursor:'pointer', fontSize:12.5 }}>
                    <span style={{ transform:exp?'rotate(90deg)':'rotate(0)', transition:'transform .15s', display:'inline-block', fontSize:10 }}>▶</span>
                    <span style={{ fontWeight:600 }}>{DAY_LABELS[dayNum-1]}</span>
                    <span style={{ color:'var(--fg-3)', fontSize:11 }}>— {chatterName} off</span>
                    <div style={{ flex:1 }}/>
                    {dayOTs.length>0?<Chip tone="warn">{dayOTs.length} covering</Chip>:<span style={{ fontSize:10.5, color:'var(--bad)' }}>no cover</span>}
                  </div>
                  {exp&&(
                    <div style={{ padding:'0 12px 12px' }}>
                      {dayOTs.map(ot=>(
                        <div key={ot.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)', marginBottom:6 }}>
                          <Avatar name={ot.chatter?.name||'?'} size={24}/>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:500 }}>{ot.chatter?.name}</div>
                            <div className="mono" style={{ fontSize:10.5, color:ot.overtime_type==='early'?'var(--info)':'var(--warn)' }}>+{ot.hours}h {ot.overtime_type==='early'?'(comes early)':'(stays late)'}</div>
                          </div>
                          <button onClick={()=>removeOvertime(ot.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:'var(--fg-3)', fontSize:13 }}
                            onMouseEnter={e=>e.currentTarget.style.color='var(--bad)'} onMouseLeave={e=>e.currentTarget.style.color='var(--fg-3)'}>✕</button>
                        </div>
                      ))}
                      <div className="label" style={{ fontSize:10, marginTop:6, marginBottom:6 }}>Assign overtime cover</div>
                      {relevantCoworkers.length===0
                        ? <div style={{ fontSize:11, color:'var(--fg-3)', padding:8 }}>No coworkers on the same page(s).</div>
                        : <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            {relevantCoworkers.filter(cw=>!dayOTs.some(ot=>ot.chatter_id===cw.id)).map(cw=>(
                              <div key={cw.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)' }}>
                                <Avatar name={cw.name} size={22}/>
                                <span style={{ flex:1, fontSize:12 }}>{cw.name}</span>
                                <button onClick={()=>addOvertime(cw.id,dayNum,'early')} className="btn sm ghost" style={{ fontSize:10, padding:'3px 8px', color:'var(--info)' }}>+4h early</button>
                                <button onClick={()=>addOvertime(cw.id,dayNum,'late')} className="btn sm ghost" style={{ fontSize:10, padding:'3px 8px', color:'var(--warn)' }}>+4h late</button>
                              </div>
                            ))}
                          </div>
                      }
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Add Task Modal ─────────────────────────────── */
function AddTaskModal({ chatterId, chatterName, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(4);
  const [saving, setSaving] = useState(false);
  const inp = { width:'100%', padding:'8px 12px', borderRadius:'var(--r-btn)', fontSize:12.5, outline:'none', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)' };

  async function save(e) {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/api/tasks', { title, description, priority, chatter_id: chatterId });
      toast.success('Task created');
      onSaved(); onClose();
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ width:460, background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:20 }} onClick={e=>e.stopPropagation()}>
        <h3 style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>New Task</h3>
        <p style={{ fontSize:12, color:'var(--fg-3)', marginBottom:14 }}>for {chatterName}</p>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label className="label" style={{ display:'block', marginBottom:6 }}>Title</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} required style={inp} placeholder="e.g. Review selling technique on Leya"/>
          </div>
          <div>
            <label className="label" style={{ display:'block', marginBottom:6 }}>Description</label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} style={{...inp, resize:'vertical'}} placeholder="Details, context, what to look for..."/>
          </div>
          <div>
            <label className="label" style={{ display:'block', marginBottom:6 }}>Priority</label>
            <div style={{ display:'flex', gap:6 }}>
              {[{v:1,l:'Critical',c:'#f87171'},{v:2,l:'High',c:'#f59e0b'},{v:3,l:'Medium',c:'#60a5fa'},{v:4,l:'Low',c:'var(--fg-3)'}].map(p=>(
                <button key={p.v} type="button" onClick={()=>setPriority(p.v)}
                  style={{ flex:1, padding:'8px 0', borderRadius:'var(--r-btn)', cursor:'pointer', fontSize:12, fontWeight:priority===p.v?600:400,
                    border:priority===p.v?`2px solid ${p.c}`:'2px solid var(--border)',
                    background:priority===p.v?`${p.c}15`:'var(--bg-2)',
                    color:priority===p.v?p.c:'var(--fg-3)',
                  }}>{p.l}</button>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving||!title}>{saving?'Creating...':'Create task'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══ MAIN PAGE ══════════════════════════════════ */
export default function ChatterProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [chatter, setChatter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employeeStats, setEmployeeStats] = useState([]);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pageTimeframe, setPageTimeframe] = useState('1d');
  const [tasks, setTasks] = useState([]);
  const [showTaskModal, setShowTaskModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [chatterRes, statsRes, tasksRes] = await Promise.all([
        api.get(`/api/chatters/${id}`),
        api.get(`/api/metrics/employee-stats?chatter_id=${id}`).catch(() => ({ data:[] })),
        api.get(`/api/tasks?chatter_id=${id}`).catch(() => ({ data:[] })),
      ]);
      setChatter(chatterRes.data);
      setEmployeeStats(statsRes.data || []);
      setTasks(tasksRes.data || []);
    } catch (err) { console.error(err); toast.error('Failed to load profile'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(newStatus) {
    try { await api.put(`/api/chatters/${id}`, { status:newStatus }); toast.success('Status updated'); setStatusOpen(false); load(); }
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
  const assignments = chatter.chatter_creator_assignments?.filter(a=>a.is_active) || [];
  const creatorNames = assignments.map(a=>a.creators?.name).filter(Boolean);
  const shiftName = assignments[0]?.shifts?.name || '—';
  const shiftHours = assignments[0]?.shifts ? `${assignments[0].shifts.start_time?.slice(0,5)} – ${assignments[0].shifts.end_time?.slice(0,5)}` : '';

  const mistakes = chatter.mistakes || [];
  const penalties = chatter.penalties || [];
  const reviews = chatter.reviews || [];
  const metrics = chatter.latestMetrics || [];
  const latestMetric = metrics[0] || {};

  // Chart data — up to 30 days
  const salesData = metrics.map(m => parseFloat(m.sales_today)||0).reverse();

  // Latest employee stats for per-page table
  const latestDate = employeeStats.length > 0 ? employeeStats.reduce((max,s) => s.report_date > max ? s.report_date : max, '') : null;
  const latestPageStats = latestDate ? employeeStats.filter(s => s.report_date === latestDate) : [];

  // AI scores placeholder
  const aiScores = { communication:0, sales:0, discipline:0, compliance:0 };

  // Alerts
  const alerts = [];
  if (parseFloat(latestMetric.sales_today_vs_avg_pct) < -30)
    alerts.push({ severity:'high', message:`Sales ${latestMetric.sales_today_vs_avg_pct}% below 7-day average` });
  if (latestMetric.response_time_p90_seconds > 300)
    alerts.push({ severity:'high', message:`P90 response time ${latestMetric.response_time_p90_seconds}s (>5 min)` });
  if (latestMetric.response_time_trend === 'degrading')
    alerts.push({ severity:'warn', message:'Response times degrading over last 3 days' });
  const repeatedMistakes = {};
  mistakes.forEach(m => { repeatedMistakes[m.category] = (repeatedMistakes[m.category]||0) + 1; });
  Object.entries(repeatedMistakes).filter(([_,c]) => c >= 3).forEach(([cat,count]) => {
    alerts.push({ severity:'warn', message:`${cat.replace(/_/g,' ')}: repeated ${count} times` });
  });

  // Sales and golden ratio colors
  const salesColor = parseFloat(latestMetric.sales_today_vs_avg_pct) > 0 ? '#4ade80' : parseFloat(latestMetric.sales_today_vs_avg_pct) < -20 ? '#f87171' : 'var(--fg-0)';
  const gr = parseFloat(latestMetric.golden_ratio) || 0;
  const ur = parseFloat(latestMetric.unlock_rate) || 0;

  return (
    <div className="animate-in" style={{ maxWidth:1200, margin:'0 auto' }}>
      <button className="btn ghost sm" onClick={() => navigate(-1)} style={{ marginBottom:12, color:'var(--fg-3)' }}>
        <ArrowLeft size={14}/> Back
      </button>

      {/* ═══ HEADER ═══ */}
      <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:'20px 20px 16px', marginBottom:12, display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ position:'relative' }}>
          <Avatar name={chatter.name} size={56}/>
          {aiScores.communication > 0 && (
            <svg width={64} height={64} style={{ position:'absolute', top:-4, left:-4 }}>
              <circle cx={32} cy={32} r={30} fill="none" stroke="var(--border)" strokeWidth={3}/>
              <circle cx={32} cy={32} r={30} fill="none" stroke={aiScores.communication>=7?'#4ade80':aiScores.communication>=5?'#fbbf24':'#f87171'} strokeWidth={3} strokeDasharray={`${(aiScores.communication/10)*188} 188`} strokeLinecap="round" transform="rotate(-90 32 32)"/>
            </svg>
          )}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <h1 style={{ fontSize:22, fontWeight:700, color:meta.nameColor }}>{chatter.name}</h1>
            <div style={{ position:'relative' }}>
              <button onClick={()=>setStatusOpen(!statusOpen)} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:999, background:`${meta.color}20`, color:meta.nameColor, border:`1px solid ${meta.color}40`, fontSize:11.5, fontWeight:500, cursor:'pointer' }}>
                {meta.label} <ChevronDown size={12}/>
              </button>
              {statusOpen && (
                <div style={{ position:'absolute', top:'100%', left:0, marginTop:4, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', zIndex:10, minWidth:140, boxShadow:'var(--shadow-raised)' }}>
                  {Object.entries(STATUS_META).map(([k,v]) => (
                    <button key={k} onClick={()=>changeStatus(k)} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', width:'100%', border:'none', background:chatter.status===k?'var(--bg-3)':'transparent', color:'var(--fg-0)', fontSize:12, cursor:'pointer', textAlign:'left' }}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--bg-3)'} onMouseLeave={e=>e.currentTarget.style.background=chatter.status===k?'var(--bg-3)':'transparent'}>
                      <StatusDot status={k}/> {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
            {creatorNames.map(n => <Chip key={n} tone="neutral" style={{ fontSize:11 }}>{n}</Chip>)}
            <span style={{ fontSize:12, color:'var(--fg-3)', display:'flex', alignItems:'center', gap:4 }}><Clock size={11}/> {shiftName} {shiftHours}</span>
            <span style={{ fontSize:12, color:'var(--fg-3)' }}>joined {new Date(chatter.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button className="btn" onClick={()=>setShowPenaltyModal(true)}><Star size={13}/> Penalty / Bonus</button>
          <button className="btn primary" onClick={()=>setShowTaskModal(true)}><Plus size={13}/> Task</button>
        </div>
      </div>

      {/* ═══ AI SCORE CARDS ═══ */}
      <div style={{ display:'flex', gap:10, marginBottom:12 }}>
        <AIScoreCard icon={MessageSquare} label="Communication" score={aiScores.communication} trend="up" color="#60a5fa"/>
        <AIScoreCard icon={DollarSign} label="Sales Execution" score={aiScores.sales} trend="down" color="#4ade80"/>
        <AIScoreCard icon={Activity} label="Work Discipline" score={aiScores.discipline} trend="stable" color="#fbbf24"/>
        <AIScoreCard icon={Shield} label="Compliance" score={aiScores.compliance} trend="stable" color="#a78bfa"/>
      </div>

      {/* ═══ ALERTS ═══ */}
      {alerts.length > 0 && <div style={{ marginBottom:12 }}><AlertsBanner alerts={alerts}/></div>}

      {/* ═══ KPI STRIP ═══ */}
      <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden', marginBottom:12 }}>
        <div style={{ display:'flex', background:'var(--bg-2)' }}>
          <KPI label="Sales (latest day)" value={`$${parseFloat(latestMetric.sales_today||0).toFixed(0)}`} color={salesColor}
            sub={latestMetric.sales_today_vs_avg_pct ? `${latestMetric.sales_today_vs_avg_pct>0?'+':''}${latestMetric.sales_today_vs_avg_pct}% vs avg` : null}/>
          <KPI label="7d Avg" value={`$${parseFloat(latestMetric.sales_7day_avg||0).toFixed(0)}`}/>
          <KPI label="Golden Ratio" value={`${gr.toFixed(1)}%`} color={goldenColor(gr)}/>
          <KPI label="Unlock Rate" value={`${ur.toFixed(0)}%`} color={unlockColor(ur)}/>
          <KPI label="Mistakes (30d)" value={mistakes.filter(m=>new Date(m.created_at)>new Date(Date.now()-30*86400000)).length}
            color={mistakes.filter(m=>new Date(m.created_at)>new Date(Date.now()-30*86400000)).length>3?'#f87171':'var(--fg-0)'}/>
          <KPI label="Last review" value={reviews.length>0?`${Math.floor((Date.now()-new Date(reviews[0].created_at))/(86400000))}d ago`:'never'}/>
        </div>
      </div>

      {/* ═══ AI SUMMARY + PER-PAGE ═══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.2fr', gap:12, marginBottom:12 }}>
        <AIDailySummary summary={null}/>
        <PageContribution stats={latestPageStats} allStats={employeeStats} timeframe={pageTimeframe} setTimeframe={setPageTimeframe}/>
      </div>

      {/* ═══ BOTTOM ZONE ═══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:12 }}>
        {/* Left */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Sales trend */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <span style={{ fontWeight:600, fontSize:13 }}>Performance Trends</span>
              <span style={{ fontSize:11, color:'var(--fg-3)' }}>{metrics.length} days</span>
            </div>
            <SalesChart data={salesData} label="Daily Sales" color="var(--indigo-bright)"/>
          </div>

          {/* Mistake Patterns */}
          <MistakePatterns mistakes={mistakes}/>

          {/* Open Tasks */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
              <span style={{ fontWeight:600, fontSize:13 }}>Open Tasks</span>
              <div style={{ flex:1 }}/>
              <button className="btn sm" onClick={()=>setShowTaskModal(true)}><Plus size={12}/> Add task</button>
            </div>
            <div style={{ padding:8 }}>
              {tasks.length === 0 ? (
                <div style={{ padding:20, textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>No open tasks. Create one or wait for AI auto-generation.</div>
              ) : tasks.filter(t=>t.status!=='completed').slice(0,10).map(t => {
                const pColors = {1:'#f87171',2:'#f59e0b',3:'#60a5fa',4:'var(--fg-3)'};
                return (
                  <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderBottom:'1px solid var(--border-soft)' }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:pColors[t.priority]||'var(--fg-3)', flexShrink:0 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12.5, fontWeight:500 }}>{t.title}</div>
                      <div style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:2 }}>
                        {t.status} · {t.claimed_user?.name ? `claimed by ${t.claimed_user.name}` : 'unclaimed'}
                      </div>
                    </div>
                    <Chip tone={t.status==='in_progress'?'info':t.status==='pending_review'?'warn':'neutral'} style={{ fontSize:9.5 }}>
                      {t.status.replace(/_/g,' ')}
                    </Chip>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <WeeklySchedule chatterId={id} chatterName={chatter.name} workDays={chatter.work_days} assignments={assignments} onUpdate={load}/>

          {/* Performance reviews */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
              <span style={{ fontWeight:600, fontSize:13 }}>Performance Reviews</span>
              <span style={{ fontSize:11, color:'var(--fg-3)' }}>{reviews.length}</span>
            </div>
            <div style={{ padding:'4px 16px', maxHeight:250, overflow:'auto' }}>
              {reviews.length===0 ? <div style={{ padding:20, textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>No reviews yet. Reviews come from completed tasks.</div>
                : reviews.map(r=><ReviewEntry key={r.id} r={r}/>)}
            </div>
          </div>

          {/* Mistake log */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
              <span style={{ fontWeight:600, fontSize:13 }}>Mistake Log</span>
              <span style={{ fontSize:11, color:'var(--fg-3)' }}>{mistakes.length} entries</span>
            </div>
            <div style={{ padding:'4px 16px', maxHeight:300, overflow:'auto' }}>
              {mistakes.length===0 ? <div style={{ padding:20, textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>No mistakes logged yet.</div>
                : mistakes.map(m=><MistakeEntry key={m.id} m={m}/>)}
            </div>
          </div>

          {/* Penalties & Bonuses */}
          <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
              <span style={{ fontWeight:600, fontSize:13 }}>Penalties & Bonuses</span>
              <div style={{ flex:1 }}/>
              <button className="btn sm" onClick={()=>setShowPenaltyModal(true)}><Plus size={12}/> Add</button>
            </div>
            <div style={{ padding:'4px 16px' }}>
              {penalties.length===0 ? (
                <div style={{ padding:16, textAlign:'center', color:'var(--fg-3)', fontSize:12, border:'1px dashed var(--border)', borderRadius:'var(--r-tile)', margin:8 }}>No penalties or bonuses.</div>
              ) : penalties.map(p => {
                const isBonus = p.penalty_type === 'bonus';
                return (
                  <div key={p.id} style={{ padding:'10px 0', borderBottom:'1px solid var(--border-soft)', display:'flex', alignItems:'flex-start', gap:10 }}>
                    <div style={{ marginTop:2, fontSize:14 }}>{isBonus ? '★' : '⚠'}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:10, fontWeight:600, textTransform:'uppercase', padding:'2px 6px', borderRadius:4, background:isBonus?'rgba(74,222,128,0.1)':'rgba(248,113,113,0.1)', color:isBonus?'#4ade80':'#f87171' }}>
                          {isBonus ? 'BONUS' : 'PENALTY'}
                        </span>
                        {p.amount && <span className="mono" style={{ fontSize:12, color:isBonus?'#4ade80':'#f87171' }}>{isBonus?'+':'-'}${p.amount}</span>}
                        <span className="mono" style={{ fontSize:10, color:'var(--fg-3)' }}>{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--fg-1)', marginTop:4 }}>{p.description}</div>
                      {p.users?.name && <div style={{ fontSize:10.5, color:'var(--fg-3)', marginTop:2 }}>by {p.users.name}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showPenaltyModal && <PenaltyModal chatterId={id} onClose={()=>setShowPenaltyModal(false)} onSaved={load}/>}
        {showTaskModal && <AddTaskModal chatterId={id} chatterName={chatter.name} onClose={()=>setShowTaskModal(false)} onSaved={load}/>}
    </div>
  );
}
