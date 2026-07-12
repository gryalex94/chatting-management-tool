import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Avatar, Chip, StatusDot } from '../../components/shared';
import { STATUS_META } from '../../utils/helpers';
import { TIER, fmtSentAt } from '../../utils/taskMeta';
import {
  ArrowLeft, Plus, Clock, ChevronDown, MessageSquare,
  Calendar, DollarSign, Brain, BarChart3, Flag
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

function AIDailySummary({ summary, date }) {
  return (
    <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:'14px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <Brain size={14} style={{ color:'var(--indigo-bright)' }}/>
        <span style={{ fontWeight:600, fontSize:13 }}>AI Daily Summary</span>
        <div style={{ flex:1 }}/>
        {date && <span style={{ fontSize:10.5, color:'var(--fg-3)' }}>compliance check · {date}</span>}
      </div>
      {summary
        ? <p style={{ fontSize:12.5, color:'var(--fg-1)', lineHeight:1.65, margin:0 }}>{summary}</p>
        : <p style={{ fontSize:12, color:'var(--fg-3)', margin:0, fontStyle:'italic' }}>No compliance summary yet — run the Daily Check for this chatter to populate it.</p>
      }
    </div>
  );
}

// Sales/communication quality grader — run on demand. Feeds the two score cards.
function AIQualityPanel({ ev, onRun, running, canRun }) {
  const overall = ev?.evaluation?.overall;
  const issues = ev?.evaluation?.issues || [];
  const sevColor = s => s === 'high' || s === 'critical' ? '#f87171' : s === 'medium' ? '#fbbf24' : 'var(--fg-3)';
  return (
    <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden', marginBottom:12 }}>
      <div style={{ display:'flex', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
        <Brain size={14} style={{ color:'var(--indigo-bright)' }}/>
        <span style={{ fontWeight:600, fontSize:13 }}>Dialogue Strategy Review</span>
        {ev?.report_date && <span style={{ fontSize:10.5, color:'var(--fg-3)' }}>· last run {ev.report_date}</span>}
        <div style={{ flex:1 }}/>
        <button className="btn sm primary" onClick={onRun} disabled={running || !canRun} style={{ opacity: running || !canRun ? 0.6 : 1 }}>
          {running ? 'Analysing…' : ev ? 'Re-run' : 'Run analysis'}
        </button>
      </div>
      {!ev ? (
        <div style={{ padding:20, textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>
          Not analysed yet. Run a quality check on this chatter's recent dialogues.
        </div>
      ) : (
        <div style={{ padding:14 }}>
          {overall && <p style={{ fontSize:12.5, color:'var(--fg-1)', lineHeight:1.6, margin:'0 0 10px' }}>{overall}</p>}
          {issues.length === 0 && <div style={{ fontSize:12, color:'var(--fg-3)' }}>No strategy deviations found — the chatter followed the playbook.</div>}
          {issues.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div className="label" style={{ fontSize:10 }}>{issues.length} coaching point{issues.length === 1 ? '' : 's'}</div>
              {issues.map((iss, i) => {
                const who = iss.fan_username || iss.fan || null;
                return (
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'8px 10px', background:'var(--bg-2)', borderRadius:'var(--r-tile)' }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:sevColor(iss.severity), marginTop:5, flexShrink:0 }}/>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ fontSize:11.5, color:'var(--fg-1)', lineHeight:1.45 }}>{iss.detail || iss.title || iss.issue || 'Issue'}</div>
                      {(who || iss.sent_at || iss.area) && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:4, fontSize:10.5, color:'var(--fg-3)' }}>
                          {iss.area && <span style={{ textTransform:'capitalize' }}>{iss.area}</span>}
                          {who && <span style={{ color:'var(--indigo-bright)', fontWeight:600 }}>@{who}</span>}
                          {iss.spend != null && <span>${iss.spend} spent</span>}
                          {iss.sent_at && <span>🕐 {fmtSentAt(iss.sent_at)}</span>}
                        </div>
                      )}
                      {iss.message && (
                        <div style={{ fontSize:11, color:'var(--fg-2)', fontStyle:'italic', marginTop:4, paddingLeft:8, borderLeft:'2px solid var(--border)', lineHeight:1.4 }}>
                          “{iss.message}”
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
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

// Build a real CALENDAR series (last N days ending at the latest day with data).
// A missing day = the chatter didn't work that day (a gap), NOT a missing upload.
function buildDailySeries(stats, days) {
  const byDate = {};
  (stats || []).forEach(s => { if (s.report_date) byDate[s.report_date] = (byDate[s.report_date] || 0) + (parseFloat(s.sales) || 0); });
  const dates = Object.keys(byDate).sort();
  if (!dates.length) return [];
  const end = new Date(dates[dates.length - 1] + 'T00:00:00Z');
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end); d.setUTCDate(d.getUTCDate() - i);
    const ds = d.toISOString().slice(0, 10);
    out.push({ date: ds, sales: ds in byDate ? byDate[ds] : null });   // null = off
  }
  return out;
}

const RANGES = [{ k: 7, l: '7 days' }, { k: 30, l: '30 days' }, { k: 90, l: '90 days' }];

function PerformanceTrend({ stats }) {
  const [range, setRange] = useState(7);
  const [hover, setHover] = useState(null);
  const series = buildDailySeries(stats, range);
  const worked = series.filter(p => p.sales != null);

  if (!worked.length) return (
    <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:16 }}>
      <span style={{ fontWeight:600, fontSize:13 }}>Performance Trend</span>
      <div style={{ padding:'24px 0', textAlign:'center', color:'var(--fg-3)', fontSize:12 }}>No sales data yet.</div>
    </div>
  );

  const W = 520, H = 130, padL = 10, padR = 10, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxV = Math.max(...worked.map(p => p.sales), 1);
  const n = series.length;
  const xOf = i => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yOf = v => padT + innerH - (v / maxV) * innerH;

  // Line segments only across CONSECUTIVE worked days (off days break the line).
  const segments = [];
  let cur = [];
  series.forEach((p, i) => {
    if (p.sales != null) cur.push(`${xOf(i)},${yOf(p.sales)}`);
    else { if (cur.length) segments.push(cur); cur = []; }
  });
  if (cur.length) segments.push(cur);

  const total = worked.reduce((s, p) => s + p.sales, 0);
  const avg = total / worked.length;
  const dM = ds => { const [, m, d] = ds.split('-'); return `${parseInt(d)}/${parseInt(m)}`; };

  return (
    <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <span style={{ fontWeight:600, fontSize:13 }}>Performance Trend</span>
        <div style={{ display:'flex', gap:4 }}>
          {RANGES.map(r => (
            <button key={r.k} onClick={() => { setRange(r.k); setHover(null); }}
              style={{ fontSize:10.5, padding:'3px 9px', borderRadius:'var(--r-btn)', cursor:'pointer', fontWeight:700,
                border:`1px solid ${range === r.k ? 'var(--indigo)' : 'var(--border)'}`,
                background: range === r.k ? 'var(--indigo-soft)' : 'var(--bg-2)', color: range === r.k ? 'var(--indigo-bright)' : 'var(--fg-3)' }}>
              {r.l}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display:'flex', gap:16, marginBottom:6, fontSize:11, color:'var(--fg-3)' }}>
        <span>Total <b style={{ color:'var(--fg-0)' }}>${Math.round(total).toLocaleString()}</b></span>
        <span>Avg/working day <b style={{ color:'var(--fg-0)' }}>${Math.round(avg).toLocaleString()}</b></span>
        <span>{worked.length}/{n} days worked</span>
      </div>

      <div style={{ position:'relative' }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:'visible' }} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="ptgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--indigo-bright)" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="var(--indigo-bright)" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* area + line per segment */}
          {segments.map((seg, si) => (
            <g key={si}>
              {seg.length > 1 && <polyline points={seg.join(' ')} fill="none" stroke="var(--indigo-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}
            </g>
          ))}
          {/* points: worked = solid, off = hollow on baseline */}
          {series.map((p, i) => p.sales != null ? (
            <circle key={i} cx={xOf(i)} cy={yOf(p.sales)} r={hover === i ? 4.5 : 3} fill="var(--indigo-bright)"/>
          ) : (
            <circle key={i} cx={xOf(i)} cy={padT + innerH} r={2.5} fill="none" stroke="var(--fg-4)" strokeWidth="1"/>
          ))}
          {/* hover guide */}
          {hover != null && <line x1={xOf(hover)} y1={padT - 6} x2={xOf(hover)} y2={padT + innerH} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3"/>}
          {/* invisible hover bands */}
          {series.map((p, i) => (
            <rect key={`h${i}`} x={xOf(i) - innerW / (2 * n)} y={0} width={innerW / n + 2} height={H} fill="transparent"
              onMouseEnter={() => setHover(i)} style={{ cursor:'pointer' }}/>
          ))}
          {/* x labels: first / mid / last */}
          {[0, Math.floor((n - 1) / 2), n - 1].map(i => (
            <text key={`x${i}`} x={xOf(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--fg-4)">{dM(series[i].date)}</text>
          ))}
        </svg>
        {hover != null && (
          <div style={{ position:'absolute', top:-4, left:`${(xOf(hover) / W) * 100}%`, transform:'translateX(-50%)', pointerEvents:'none',
            background:'var(--bg-3)', border:'1px solid var(--border-strong)', borderRadius:6, padding:'4px 8px', fontSize:11, whiteSpace:'nowrap', boxShadow:'0 4px 12px rgba(0,0,0,0.3)' }}>
            <div style={{ color:'var(--fg-3)', fontSize:10 }}>{dM(series[hover].date)}</div>
            {series[hover].sales != null
              ? <div style={{ fontWeight:700 }}>${Math.round(series[hover].sales).toLocaleString()}</div>
              : <div style={{ color:'var(--fg-4)', fontWeight:600 }}>off / didn't work</div>}
          </div>
        )}
      </div>
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

function WeeklySchedule({ chatterId, workDays, assignments, onUpdate }) {
  const days = workDays || [1,2,3,4,5];
  // New cover model: this chatter's recurring covers (weekday + hours) from the Shifts board.
  const covers = (assignments || []).filter(a => a.day_of_week != null && a.cover_hours != null)
    .sort((a, b) => a.day_of_week - b.day_of_week);
  const coverDays = new Set(covers.map(c => c.day_of_week));

  async function toggle(dayNum) {
    const updated = days.includes(dayNum) ? days.filter(d=>d!==dayNum) : [...days,dayNum].sort();
    try { await api.put(`/api/chatters/${chatterId}`, { work_days: updated }); toast.success('Schedule updated'); onUpdate(); }
    catch { toast.error('Failed'); }
  }

  return (
    <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
        <Calendar size={14} style={{ color:'var(--fg-3)' }}/>
        <span style={{ fontWeight:600, fontSize:13 }}>Weekly Schedule</span>
        <div style={{ flex:1 }}/>
        <span style={{ fontSize:11, color:'var(--fg-3)' }}>{days.length} days/week</span>
      </div>
      <div style={{ padding:16 }}>
        <div style={{ display:'flex', gap:6, marginBottom:14 }}>
          {DAY_LABELS.map((label,i) => {
            const dayNum=DAY_NUMBERS[i], active=days.includes(dayNum), hasCover=coverDays.has(dayNum);
            return (
              <button key={dayNum} onClick={()=>toggle(dayNum)} style={{
                flex:1, padding:'10px 0', borderRadius:'var(--r-tile)', cursor:'pointer',
                border:active?'2px solid var(--indigo-bright)':'2px solid var(--border)',
                background:active?'var(--indigo-soft)':'var(--bg-2)', color:active?'var(--indigo-bright)':'var(--fg-3)',
                fontWeight:active?700:500, fontSize:12, textAlign:'center', transition:'all .12s', position:'relative',
              }}>
                {label}
                {hasCover&&<div title="Cover shift" style={{ position:'absolute',top:-4,right:-4,width:8,height:8,borderRadius:'50%',background:'var(--indigo-bright)',border:'2px solid var(--bg-1)' }}/>}
              </button>
            );
          })}
        </div>

        <div className="label" style={{ fontSize:10, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
          Cover shifts
          <span style={{ fontWeight:400, color:'var(--fg-4)', textTransform:'none', letterSpacing:0 }}>· managed on the Shifts board</span>
        </div>
        {covers.length === 0 ? (
          <div style={{ fontSize:11.5, color:'var(--fg-3)', padding:'10px 12px', border:'1px dashed var(--border)', borderRadius:'var(--r-tile)', textAlign:'center' }}>
            No cover shifts. Add them by dragging onto the Shifts board.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {covers.map(c => (
              <div key={c.shift_id ? `${c.creator_id}-${c.shift_id}-${c.day_of_week}` : c.day_of_week}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:'var(--indigo-soft)', border:'1px solid var(--indigo-line)', borderRadius:'var(--r-tile)' }}>
                <span style={{ fontSize:10.5, fontWeight:700, color:'var(--indigo-bright)', width:30 }}>{DAY_LABELS[c.day_of_week-1]}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:600 }}>{c.creators?.name || '—'}</div>
                  <div style={{ fontSize:10.5, color:'var(--fg-3)' }}>{c.shifts?.name || 'shift'}</div>
                </div>
                <span className="mono" style={{ fontSize:11.5, fontWeight:700, color:'var(--indigo-bright)' }}>+{c.cover_hours}h</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Add Task Modal ─────────────────────────────── */
// Creates a CUSTOM task (the manager queue) attached to this chatter — pins above
// the AI tasks on the Tasks screen.
function AddTaskModal({ chatterId, chatterName, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [important, setImportant] = useState(false);
  const [saving, setSaving] = useState(false);
  const inp = { width:'100%', padding:'8px 12px', borderRadius:'var(--r-btn)', fontSize:12.5, outline:'none', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)' };

  async function save(e) {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/api/review-tasks/custom', { title, detail: description, important, chatter_id: chatterId });
      toast.success('Custom task created');
      onSaved(); onClose();
    } catch (err) { toast.error(err?.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ width:460, background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', padding:20 }} onClick={e=>e.stopPropagation()}>
        <h3 style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>New custom task</h3>
        <p style={{ fontSize:12, color:'var(--fg-3)', marginBottom:14 }}>for {chatterName} · pins above the AI queue on Tasks</p>
        <form onSubmit={save} style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label className="label" style={{ display:'block', marginBottom:6 }}>Title</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} required style={inp} placeholder="e.g. Review selling technique on Leya"/>
          </div>
          <div>
            <label className="label" style={{ display:'block', marginBottom:6 }}>Details (optional)</label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} style={{...inp, resize:'vertical'}} placeholder="What to do, context…"/>
          </div>
          <div>
            <label className="label" style={{ display:'block', marginBottom:6 }}>Importance</label>
            <div style={{ display:'flex', gap:8 }}>
              {[[false,'Normal'],[true,'★ Important']].map(([v,l])=>(
                <button key={l} type="button" onClick={()=>setImportant(v)}
                  style={{ flex:1, padding:'8px 0', borderRadius:'var(--r-btn)', cursor:'pointer', fontSize:12, fontWeight:700,
                    border:`2px solid ${important===v?'#f59e0b':'var(--border)'}`,
                    background:important===v?'rgba(245,158,11,0.12)':'var(--bg-2)',
                    color:important===v?'#f59e0b':'var(--fg-3)',
                  }}>{l}</button>
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
// Coaching Log — the per-chatter board. PENDING = all open/taken tasks from the
// analysis (overview; each can be saved for coaching or completed). TO COACH =
// cases saved for the next coaching session. COACHED = the coached record / KB.
function CoachingLog({ chatterId, canCreate, onAddCustom }) {
  const [tab, setTab] = useState('pending');
  const [all, setAll] = useState([]);
  const loadTasks = useCallback(async () => {
    const { data } = await api.get(`/api/review-tasks?chatter_id=${chatterId}&status=open,taken,completed`).catch(() => ({ data: { tasks: [] } }));
    setAll(data?.tasks || []);
  }, [chatterId]);
  useEffect(() => { loadTasks(); }, [loadTasks]);
  const act = async (t, action) => {
    try { await api.patch(`/api/review-tasks/${t.id}`, { action }); loadTasks(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Failed'); }
  };
  const pending = all.filter(t => t.status === 'open' || t.status === 'taken');
  const toCoach = all.filter(t => t.coach_flag && !t.coached_at);
  const coached = all.filter(t => t.coached_at);
  const list = tab === 'pending' ? pending : tab === 'tocoach' ? toCoach : coached;
  const TabBtn = ({ k, label, n }) => (
    <button onClick={() => setTab(k)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '2px 2px', color: tab === k ? 'var(--fg-0)' : 'var(--fg-3)', borderBottom: tab === k ? '2px solid var(--indigo)' : '2px solid transparent' }}>{label} {n}</button>
  );
  const empty = { pending: 'No pending cases for this chatter.', tocoach: 'Nothing saved for coaching — use the 📌 button to add cases.', coached: 'No coached cases yet.' };
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', gap: 14 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Coaching Log</span>
        <TabBtn k="pending" label="Pending" n={pending.length} />
        <TabBtn k="tocoach" label="To coach" n={toCoach.length} />
        <TabBtn k="coached" label="Coached" n={coached.length} />
        <div style={{ flex: 1 }} />
        {canCreate && <button className="btn sm" onClick={onAddCustom}><Plus size={12} /> Custom task</button>}
      </div>
      <div style={{ padding: 8, maxHeight: 460, overflowY: 'auto' }}>
        {list.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--fg-3)', fontSize: 12 }}>{empty[tab]}</div>
        ) : list.map(t => {
          const tier = TIER[t.priority] || {};
          const sentAt = t.context?.sent_at;
          return (
            <div key={t.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-soft)', opacity: t.coached_at ? 0.7 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: tier.c || 'var(--fg-3)', flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{t.title || t.detail}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-4)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {t.creator_name && <b style={{ color: 'var(--fg-3)' }}>{t.creator_name}</b>}
                    {t.fan_username && <span style={{ color: 'var(--fg-3)' }}>{t.fan_username}</span>}
                    {sentAt && <span style={{ color: 'var(--indigo-bright)', fontWeight: 600 }}>🕐 {fmtSentAt(sentAt)}</span>}
                    <span>{(t.area || '').replace(/_/g, ' ')}</span>
                    {t.coached_at && <span>✓ coached {new Date(t.coached_at).toLocaleDateString()}</span>}
                  </div>
                  {t.context?.message && <div style={{ fontSize: 11, color: 'var(--fg-2)', fontStyle: 'italic', marginTop: 4 }}>“{t.context.message}”</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {tab === 'pending' && (t.coach_flag
                    ? <button className="btn sm" onClick={() => act(t, 'uncoach')} title="Remove from coaching" style={{ color: '#f59e0b' }}>📌 Saved</button>
                    : <button className="btn sm" onClick={() => act(t, 'coach')} title="Save for coaching">📌</button>)}
                  {tab === 'pending' && <button className="btn sm primary" onClick={() => act(t, 'complete')}>Complete</button>}
                  {tab === 'tocoach' && <button className="btn sm primary" onClick={() => act(t, 'coached')}>Coached</button>}
                  {tab === 'coached' && <button className="btn sm" onClick={() => act(t, 'uncoached')} title="Move back to coach">↺</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ChatterProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = ['head_manager', 'admin', 'owner'].includes(user?.role);
  const [chatter, setChatter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employeeStats, setEmployeeStats] = useState([]);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pageTimeframe, setPageTimeframe] = useState('1d');
  const [tasks, setTasks] = useState([]);
  const [evals, setEvals] = useState([]);
  const [runningQuality, setRunningQuality] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [chatterRes, statsRes, tasksRes, evalsRes] = await Promise.all([
        api.get(`/api/chatters/${id}`),
        api.get(`/api/metrics/employee-stats?chatter_id=${id}`).catch(() => ({ data:[] })),
        api.get(`/api/review-tasks?chatter_id=${id}&status=open,taken`).catch(() => ({ data:{ tasks:[] } })),
        api.get(`/api/daily-check/chatter-evals?chatter_id=${id}`).catch(() => ({ data:{ evaluations:[] } })),
      ]);
      setChatter(chatterRes.data);
      setEmployeeStats(statsRes.data || []);
      setTasks(tasksRes.data?.tasks || []);
      setEvals(evalsRes.data?.evaluations || []);
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
  const regularAssignments = assignments.filter(a => a.day_of_week == null);   // not covers
  const creatorNames = [...new Set(regularAssignments.map(a=>a.creators?.name).filter(Boolean))];
  const shiftName = regularAssignments[0]?.shifts?.name || '—';
  const shiftHours = regularAssignments[0]?.shifts ? `${regularAssignments[0].shifts.start_time?.slice(0,5)} – ${regularAssignments[0].shifts.end_time?.slice(0,5)}` : '';

  const mistakes = chatter.mistakes || [];
  const penalties = chatter.penalties || [];
  const reviews = chatter.reviews || [];
  const metrics = chatter.latestMetrics || [];
  const latestMetric = metrics[0] || {};

  // Real daily series — sum sales across pages per CALENDAR day (not per upload row).
  const dailySales = {};
  employeeStats.forEach(s => { if (s.report_date) dailySales[s.report_date] = (dailySales[s.report_date] || 0) + (parseFloat(s.sales) || 0); });
  const dDates = Object.keys(dailySales).sort();
  const latestDay = dDates[dDates.length - 1] || null;
  const latestDaySales = latestDay ? dailySales[latestDay] : 0;
  const last7 = dDates.slice(-7).map(d => dailySales[d]);
  const avg7 = last7.length ? last7.reduce((a, b) => a + b, 0) / last7.length : 0;
  const vsAvgPct = avg7 > 0 ? Math.round(((latestDaySales - avg7) / avg7) * 100) : null;

  // Latest employee stats for per-page table
  const latestDate = employeeStats.length > 0 ? employeeStats.reduce((max,s) => s.report_date > max ? s.report_date : max, '') : null;
  const latestPageStats = latestDate ? employeeStats.filter(s => s.report_date === latestDate) : [];

  // AI evaluations: compliance → daily summary, sales_quality → quality analysis.
  const salesEval = evals.find(e => e.eval_type === 'sales_quality');
  const complianceEval = evals.find(e => e.eval_type === 'compliance');
  const commScore = parseFloat(salesEval?.evaluation?.communication_score) || 0;

  async function runQuality() {
    if (!latestDay) return toast.error('No data to analyse yet');
    setRunningQuality(true);
    try {
      const { data } = await api.post('/api/daily-check/evaluate', { chatter_id: id, report_date: latestDay, eval_type: 'sales_quality', model: 'sonnet' });
      if (data.ok === false) toast.error(data.reason || 'Nothing to analyse');
      else { toast.success('Quality analysis complete'); load(); }
    } catch (e) { toast.error(e?.response?.data?.error || 'Analysis failed'); }
    finally { setRunningQuality(false); }
  }

  // Alerts
  const alerts = [];
  if (vsAvgPct != null && vsAvgPct < -30)
    alerts.push({ severity:'high', message:`Sales ${vsAvgPct}% below 7-day average` });
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
  const salesColor = vsAvgPct == null ? 'var(--fg-0)' : vsAvgPct > 0 ? '#4ade80' : vsAvgPct < -20 ? '#f87171' : 'var(--fg-0)';
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
          {commScore > 0 && (
            <svg width={64} height={64} style={{ position:'absolute', top:-4, left:-4 }}>
              <circle cx={32} cy={32} r={30} fill="none" stroke="var(--border)" strokeWidth={3}/>
              <circle cx={32} cy={32} r={30} fill="none" stroke={commScore>=7?'#4ade80':commScore>=5?'#fbbf24':'#f87171'} strokeWidth={3} strokeDasharray={`${(commScore/10)*188} 188`} strokeLinecap="round" transform="rotate(-90 32 32)"/>
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
          {canCreate && <button className="btn primary" onClick={()=>setShowTaskModal(true)}><Plus size={13}/> Custom task</button>}
        </div>
      </div>

      {/* ═══ AI QUALITY ANALYSIS ═══ */}
      <AIQualityPanel ev={salesEval} onRun={runQuality} running={runningQuality} canRun={!!latestDay}/>

      {/* ═══ ALERTS ═══ */}
      {alerts.length > 0 && <div style={{ marginBottom:12 }}><AlertsBanner alerts={alerts}/></div>}

      {/* ═══ KPI STRIP ═══ */}
      <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden', marginBottom:12 }}>
        <div style={{ display:'flex', background:'var(--bg-2)' }}>
          <KPI label="Sales (latest day)" value={`$${Math.round(latestDaySales).toLocaleString()}`} color={salesColor}
            sub={vsAvgPct != null ? `${vsAvgPct>0?'+':''}${vsAvgPct}% vs 7d avg` : null}/>
          <KPI label="7d Avg" value={`$${Math.round(avg7).toLocaleString()}`}/>
          <KPI label="Golden Ratio" value={`${gr.toFixed(1)}%`} color={goldenColor(gr)}/>
          <KPI label="Unlock Rate" value={`${ur.toFixed(0)}%`} color={unlockColor(ur)}/>
          <KPI label="Mistakes (30d)" value={mistakes.filter(m=>new Date(m.created_at)>new Date(Date.now()-30*86400000)).length}
            color={mistakes.filter(m=>new Date(m.created_at)>new Date(Date.now()-30*86400000)).length>3?'#f87171':'var(--fg-0)'}/>
          <KPI label="Last review" value={reviews.length>0?`${Math.floor((Date.now()-new Date(reviews[0].created_at))/(86400000))}d ago`:'never'}/>
        </div>
      </div>

      {/* ═══ AI SUMMARY + PER-PAGE ═══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.2fr', gap:12, marginBottom:12 }}>
        <AIDailySummary summary={complianceEval?.evaluation?.overall} date={complianceEval?.report_date}/>
        <PageContribution stats={latestPageStats} allStats={employeeStats} timeframe={pageTimeframe} setTimeframe={setPageTimeframe}/>
      </div>

      {/* ═══ BOTTOM ZONE ═══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:12 }}>
        {/* Left */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Performance trend — calendar-based, interactive */}
          <PerformanceTrend stats={employeeStats}/>

          {/* Mistake Patterns */}
          <MistakePatterns mistakes={mistakes}/>

          {/* Coaching Log — pending cases + saved-for-coaching + coached record */}
          <CoachingLog chatterId={id} canCreate={canCreate} onAddCustom={() => setShowTaskModal(true)} />
        </div>

        {/* Right */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <WeeklySchedule chatterId={id} workDays={chatter.work_days} assignments={assignments} onUpdate={load}/>

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
