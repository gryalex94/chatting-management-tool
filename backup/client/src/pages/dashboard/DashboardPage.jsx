import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Avatar, Chip, PriorityDot, StatusDot } from '../../components/shared';
import { STATUS_META } from '../../utils/helpers';
import { ClipboardList, Play, Pause, Check, Plus, ArrowUp, ArrowDown, ArrowRight, Eye, Flame, Clock, AlertTriangle, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import CreateTaskModal from '../../components/shared/CreateTaskModal';


function StatCard({ label, value, sub, icon: Icon, tone = 'indigo', delta }) {
  const bgs = { indigo:'var(--indigo-soft)', good:'rgba(34,197,94,0.12)', warn:'rgba(245,158,11,0.12)', bad:'rgba(239,68,68,0.13)', info:'rgba(59,130,246,0.12)', purple:'rgba(139,92,246,0.12)' };
  const fgs = { indigo:'var(--indigo-bright)', good:'#4ade80', warn:'#fbbf24', bad:'#f87171', info:'#60a5fa', purple:'#a78bfa' };
  return (
    <div style={{ flex:1, padding:16, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--r-card)' }}>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        <span className="label">{label}</span>
        <span style={{ width:28, height:28, borderRadius:8, background:bgs[tone], color:fgs[tone], display:'flex', alignItems:'center', justifyContent:'center' }}><Icon size={15}/></span>
      </div>
      <div style={{ display:'flex', alignItems:'baseline', gap:8, marginTop:10 }}>
        <span className="mono" style={{ fontSize:28, fontWeight:600, letterSpacing:'-0.02em' }}>{value}</span>
        {delta!=null&&<span style={{ display:'flex', alignItems:'center', gap:2, color:delta>=0?'#4ade80':'#f87171', fontSize:12, fontWeight:600 }}>{delta>=0?<ArrowUp size={12}/>:<ArrowDown size={12}/>}{Math.abs(delta)}%</span>}
      </div>
      <div style={{ color:'var(--fg-3)', fontSize:11.5, marginTop:4 }}>{sub}</div>
    </div>
  );
}

function PanelHeader({ title, sub, right }) {
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
      <div><div style={{ fontWeight:600, fontSize:13.5 }}>{title}</div>{sub&&<div style={{ color:'var(--fg-3)', fontSize:11.5, marginTop:2 }}>{sub}</div>}</div>
      <div style={{ flex:1 }}/>{right}
    </div>
  );
}

function TaskRow({ task, onClaim, onTimer }) {
  let action;
  if (task.status==='pool') action=<button className="btn primary sm" onClick={()=>onClaim(task.id)}>Claim</button>;
  else if (task.status==='claimed') action=<button className="btn primary sm" onClick={()=>onTimer(task.id,'start')}><Play size={11}/> Start</button>;
  else if (task.status==='in_progress') action=(<div style={{display:'flex',gap:4}}><button className="btn sm" onClick={()=>onTimer(task.id,'pause')}><Pause size={11}/> Pause</button><button className="btn primary sm" onClick={()=>onTimer(task.id,'complete')}><Check size={11}/> Complete</button></div>);
  else if (task.status==='completed') action=<Chip tone="good"><Check size={11}/> Done</Chip>;
  else action=<Chip>{task.status}</Chip>;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--border-soft)', transition:'background .14s', cursor:'pointer' }}
      onMouseEnter={e=>e.currentTarget.style.background='var(--bg-3)'}
      onMouseLeave={e=>e.currentTarget.style.background=''}>
      <PriorityDot p={task.priority}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:320 }}>{task.title}</span>
          {task.rollover_counter>0&&<Chip tone="bad" style={{height:18,fontSize:10}}><Flame size={10}/> x{task.rollover_counter}</Chip>}
          {task.requires_screenshots&&<Eye size={11} style={{color:'var(--fg-3)'}}/>}
        </div>
        <div style={{ display:'flex', gap:6, marginTop:4, fontSize:11.5, color:'var(--fg-3)' }}>
          {task.creator?.name&&<span>{task.creator.name}</span>}
          {task.chatter?.name&&<><span>·</span><span>{task.chatter.name}</span></>}
          {task.claimed_user?.name&&<><span>·</span><span style={{color:'var(--indigo-bright)'}}>{task.claimed_user.name}</span></>}
        </div>
      </div>
      <div style={{ minWidth:100, display:'flex', justifyContent:'flex-end' }}>{action}</div>
    </div>
  );
}

function CreatorHeader({ name, count }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'var(--bg-2)', borderBottom:'1px solid var(--border-soft)', borderTop:'1px solid var(--border-soft)' }}>
      <Avatar name={name||'Org'} size={22}/>
      <span style={{ fontSize:11.5, fontWeight:600, letterSpacing:'.02em' }}>{name||'Org-wide'}</span>
      <div style={{flex:1}}/>
      <span style={{ fontSize:10.5, color:'var(--fg-3)' }}>{count} task{count!==1?'s':''}</span>
    </div>
  );
}

function AnomalyItem({ flag }) {
  const tone=flag.severity==='high'?'bad':flag.severity==='medium'?'warn':'info';
  const dot=flag.severity==='high'?'var(--bad)':flag.severity==='medium'?'var(--warn)':'var(--info)';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderBottom:'1px solid var(--border-soft)' }}>
      <span style={{ width:8,height:8,borderRadius:'50%',background:dot,boxShadow:`0 0 0 4px ${dot}33`,flexShrink:0 }}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:12.5, fontWeight:500 }}>{flag.flag_type?.replace(/_/g,' ')}</span>
          <Chip tone={tone} style={{height:18,fontSize:10}}>{flag.severity}</Chip>
        </div>
        <div style={{ fontSize:11.5, color:'var(--fg-3)', marginTop:3 }}>
          {flag.chatter?.name&&<span style={{color:'var(--fg-1)'}}>{flag.chatter.name}</span>}
          {flag.creator?.name&&<span> — {flag.creator.name}</span>}
        </div>
      </div>
      <button className="btn sm ghost"><ArrowRight size={12}/></button>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [chatters, setChatters] = useState([]);
  const [creators, setCreators] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showNewTask, setShowNewTask] = useState(false);

  const navigate = useNavigate();
  const load = useCallback(async () => {
    try {
      const [t,ch,cr,an] = await Promise.all([
        api.get('/api/tasks'), api.get('/api/chatters'),
        api.get('/api/creators'), api.get('/api/metrics/anomalies',{params:{resolved:'false'}}),
      ]);
      setTasks(t.data); setChatters(ch.data); setCreators(cr.data); setAnomalies(an.data);
    } catch(err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleClaim(id) { try { await api.post(`/api/tasks/${id}/claim`); toast.success('Claimed'); load(); } catch { toast.error('Failed'); } }
  async function handleTimer(id, action) { try { await api.post(`/api/tasks/${id}/timer`,{action}); toast.success(action==='complete'?'Done!':'Timer '+action); load(); } catch { toast.error('Failed'); } }

  const pool=tasks.filter(t=>t.status==='pool');
  const prog=tasks.filter(t=>['claimed','in_progress'].includes(t.status));
  const done=tasks.filter(t=>t.status==='completed');
  const active=tasks.filter(t=>!['confirmed','rolled_over'].includes(t.status));
  const shown=filter==='all'?active:filter==='pool'?pool:filter==='inprog'?prog:done;

  const grouped={};
  shown.forEach(t=>{const k=t.creator?.name||'Org-wide';if(!grouped[k])grouped[k]=[];grouped[k].push(t);});

  const myTasks=tasks.filter(t=>(t.claimed_by===user?.id||t.assigned_to===user?.id)&&!['confirmed','rolled_over'].includes(t.status));

  const hr=new Date().getHours();
  const greet=hr<12?'Morning':hr<18?'Afternoon':'Evening';

  if (loading) return <div style={{display:'flex',justifyContent:'center',paddingTop:80}}><div style={{width:24,height:24,border:'2px solid var(--indigo)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin .6s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div className="animate-in">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>{greet}, {user?.name?.split(' ')[0]}. {pool.length>0&&<span style={{color:'var(--indigo-bright)'}}>{pool.length} things need you today.</span>}</h1>
          <p style={{fontSize:13,color:'var(--fg-2)',marginTop:4}}>Active cycle</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn"><Clock size={14}/> Daily reports</button>
          <button className="btn primary" onClick={() => setShowNewTask(true)}><Plus size={14}/> New task</button>
        </div>
      </div>

      <div style={{display:'flex',gap:12,marginBottom:20}}>
        <StatCard label="POOL" value={pool.length} sub={`${tasks.filter(t=>t.rollover_counter>0).length} rolled over`} icon={ClipboardList} tone="indigo"/>
        <StatCard label="IN PROGRESS" value={prog.length} sub="managers active" icon={Play} tone="info"/>
        <StatCard label="COMPLETED" value={done.length} sub="this cycle" icon={Check} tone="good"/>
        <StatCard label="ANOMALIES" value={anomalies.length} sub={anomalies.length>0?'awaiting action':'all clear'} icon={AlertTriangle} tone={anomalies.length>0?'bad':'good'}/>
        <StatCard label="CREATORS" value={creators.length} sub={`${chatters.length} chatters`} icon={Users} tone="purple"/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div style={{background:'var(--bg-1)',border:'1px solid var(--border)',borderRadius:'var(--r-panel)',overflow:'hidden'}}>
          <PanelHeader title="All tasks" sub={`${pool.length} pool · ${prog.length} active · ${done.length} done`}
            right={<div style={{display:'flex',gap:4}}>
              {[['all','All'],['pool','Pool'],['inprog','In progress']].map(([k,l])=><button key={k} className={`btn sm ${filter===k?'primary':''}`} onClick={()=>setFilter(k)}>{l}</button>)}
              <button className="btn primary sm" onClick={() => setShowNewTask(true)}><Plus size={12}/> New task</button>
            </div>}/>
          <div style={{maxHeight:520,overflow:'auto'}}>
            {Object.keys(grouped).length===0?<div style={{padding:40,textAlign:'center',color:'var(--fg-3)',fontSize:13}}>No tasks yet. Create one or upload reports.</div>
            :Object.entries(grouped).map(([name,ts])=><div key={name}><CreatorHeader name={name} count={ts.length}/>{ts.map(t=><TaskRow key={t.id} task={t} onClaim={handleClaim} onTimer={handleTimer}/>)}</div>)}
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{background:'var(--bg-1)',border:'1px solid var(--border)',borderRadius:'var(--r-panel)',overflow:'hidden'}}>
            <PanelHeader title="My tasks" sub="Yours + auto-assigned" right={<button className="btn sm" onClick={() => setShowNewTask(true)}><Plus size={12}/> Add</button>}/>
            <div style={{maxHeight:300,overflow:'auto'}}>
              {myTasks.length===0?<div style={{padding:24,textAlign:'center',color:'var(--fg-3)',fontSize:12}}>Claim tasks from the pool</div>
              :myTasks.map(t=><TaskRow key={t.id} task={t} onClaim={handleClaim} onTimer={handleTimer}/>)}
            </div>
          </div>

          <div style={{background:'var(--bg-1)',border:'1px solid var(--border)',borderRadius:'var(--r-panel)',overflow:'hidden'}}>
            <PanelHeader title="Anomalies" sub={`${anomalies.length} active`} right={anomalies.length>0&&<Chip tone="bad">{anomalies.filter(a=>a.severity==='high').length} high</Chip>}/>
            <div style={{maxHeight:260,overflow:'auto'}}>
              {anomalies.length===0?<div style={{padding:24,textAlign:'center',color:'var(--fg-3)',fontSize:12}}>All clear</div>
              :anomalies.map(a=><AnomalyItem key={a.id} flag={a}/>)}
            </div>
          </div>

          <div style={{background:'var(--bg-1)',border:'1px solid var(--border)',borderRadius:'var(--r-panel)',overflow:'hidden'}}>
            <PanelHeader title="Chatters" sub={`${chatters.length} total`}/>
            <div style={{padding:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {chatters.slice(0,8).map(ch=>(
                <div key={ch.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:10,cursor:'pointer',transition:'border-color .12s'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-strong)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}
                  onClick={()=>navigate(`/chatters/${ch.id}`)}>
                  <Avatar name={ch.name} size={24}/>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      <StatusDot status={ch.status}/>
                      <span style={{fontSize:11.5,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ch.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {showNewTask && <CreateTaskModal onClose={() => setShowNewTask(false)} onCreated={load} />}
    </div>
  );
}
