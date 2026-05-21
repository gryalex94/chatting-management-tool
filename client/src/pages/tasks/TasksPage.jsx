import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Avatar, Chip, PriorityDot } from '../../components/shared';
import { fmtTimer } from '../../utils/helpers';
import { Plus, Play, Pause, Check, Eye, Flame, Search, SlidersHorizontal, LayoutGrid, List } from 'lucide-react';
import toast from 'react-hot-toast';
import CreateTaskModal from '../../components/shared/CreateTaskModal';

const LANES = [
  { id:'pool',        label:'Pool',        tone:'warn',   fg:'#fbbf24' },
  { id:'claimed',     label:'Claimed',     tone:'indigo', fg:'#818cf8' },
  { id:'in_progress', label:'In progress', tone:'info',   fg:'#60a5fa' },
  { id:'completed',   label:'Done',        tone:'good',   fg:'#4ade80' },
];

function TaskCard({ task, onClaim, onTimer }) {
  const chName = task.chatter?.name;
  const claimedBy = task.claimed_user?.name;

  let action;
  if (task.status==='pool') action=<button className="btn primary sm" style={{width:'100%',justifyContent:'center',height:26,fontSize:11}} onClick={()=>onClaim(task.id)}>Claim</button>;
  else if (task.status==='claimed') action=<button className="btn primary sm" style={{width:'100%',justifyContent:'center',height:26,fontSize:11}} onClick={()=>onTimer(task.id,'start')}><Play size={10}/> Start</button>;
  else if (task.status==='in_progress') action=(
    <div style={{display:'flex',gap:4,width:'100%'}}>
      <button className="btn sm" style={{flex:1,justifyContent:'center',height:26,fontSize:10.5}} onClick={()=>onTimer(task.id,'pause')}><Pause size={10}/></button>
      <button className="btn primary sm" style={{flex:1,justifyContent:'center',height:26,fontSize:10.5}} onClick={()=>onTimer(task.id,'complete')}><Check size={10}/> Done</button>
    </div>
  );
  else action=<div style={{textAlign:'center',fontSize:10.5,color:'var(--fg-3)',padding:'5px 0',borderTop:'1px dashed var(--border)'}}>completed</div>;

  return (
    <div style={{
      background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:9,
      padding:10, display:'flex', flexDirection:'column', gap:8,
      transition:'border-color .12s',
    }}
    onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-strong)'}
    onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
      <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
        <PriorityDot p={task.priority}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11.5,fontWeight:600,lineHeight:1.3,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
            {task.title}
          </div>
        </div>
        {task.rollover_counter>0&&<Chip tone="bad" style={{height:16,fontSize:9.5,padding:'0 5px',flexShrink:0}}>×{task.rollover_counter}</Chip>}
      </div>

      <div style={{display:'flex',gap:6,fontSize:10.5,color:'var(--fg-3)',alignItems:'center'}}>
        {chName&&<><Avatar name={chName} size={16}/><span style={{color:'var(--fg-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{chName}</span></>}
        <div style={{flex:1}}/>
        {task.requires_screenshots&&<Eye size={10}/>}
      </div>

      {claimedBy&&task.status!=='pool'&&task.status!=='completed'&&(
        <div style={{fontSize:10,color:'var(--fg-3)'}}>by <span style={{color:'var(--indigo-bright)'}}>{claimedBy}</span></div>
      )}

      {action}
    </div>
  );
}

function Lane({ lane, tasks, onClaim, onTimer }) {
  return (
    <div style={{flex:1,minWidth:0,background:'var(--bg-1)',border:'1px solid var(--border)',borderRadius:10,display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'8px 10px',borderBottom:'1px solid var(--border-soft)'}}>
        <span style={{width:6,height:6,borderRadius:'50%',background:lane.fg}}/>
        <span style={{fontSize:11,fontWeight:600,color:lane.fg,letterSpacing:'.02em'}}>{lane.label}</span>
        <span style={{fontSize:10,color:'var(--fg-3)'}}>· {tasks.length}</span>
      </div>
      <div style={{padding:8,display:'flex',flexDirection:'column',gap:8,flex:1,minHeight:130}}>
        {tasks.length===0?<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--fg-3)',fontSize:10.5}}>—</div>
        :tasks.map(t=><TaskCard key={t.id} task={t} onClaim={onClaim} onTimer={onTimer}/>)}
      </div>
    </div>
  );
}

function CreatorRow({ name, tasks, rolledCount, onClaim, onTimer, onNewTask }) {
  const byLane = {};
  LANES.forEach(l=>{byLane[l.id]=tasks.filter(t=>t.status===l.id);});
  const openCount=tasks.filter(t=>['pool','claimed'].includes(t.status)).length;
  const runCount=tasks.filter(t=>t.status==='in_progress').length;
  const doneCount=tasks.filter(t=>t.status==='completed').length;

  return (
    <div style={{marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
        <Avatar name={name||'Org'} size={28}/>
        <div>
          <span style={{fontSize:14,fontWeight:600}}>{name||'Org-wide'}</span>
          <span style={{fontSize:11.5,color:'var(--fg-3)',marginLeft:8}}>
            {tasks.length} tasks this cycle · {openCount} open · {runCount} running · {doneCount} done
          </span>
        </div>
        <div style={{flex:1}}/>
        {rolledCount>0&&<Chip tone="bad"><Flame size={10}/> {rolledCount} rolled</Chip>}
        <button className="btn sm" onClick={onNewTask}><Plus size={12}/> Task for {(name||'Org').split(' ')[0]}</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:10}}>
        {LANES.map(l=><Lane key={l.id} lane={l} tasks={byLane[l.id]||[]} onClaim={onClaim} onTimer={onTimer}/>)}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);

  const load = useCallback(async()=>{
    try {
      const [t,cr]=await Promise.all([api.get('/api/tasks'),api.get('/api/creators')]);
      setTasks(t.data); setCreators(cr.data);
    } catch(e){console.error(e);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{load();},[load]);

  async function onClaim(id){try{await api.post(`/api/tasks/${id}/claim`);toast.success('Claimed');load();}catch{toast.error('Failed');}}
  async function onTimer(id,action){try{await api.post(`/api/tasks/${id}/timer`,{action});toast.success(action==='complete'?'Done!':'Timer '+action);load();}catch{toast.error('Failed');}}

  // Filter
  const active = tasks.filter(t=>!['confirmed','rolled_over'].includes(t.status));
  let filtered = active;
  if (statusFilter==='history') {
    filtered = tasks.filter(t=>t.status==='confirmed');
  } else if (statusFilter!=='all') {
    const map = {pool:['pool'],claimed:['claimed'],inprog:['in_progress'],done:['completed']};
    filtered = active.filter(t=>(map[statusFilter]||[]).includes(t.status));
  }
  if (search) filtered = filtered.filter(t=>t.title?.toLowerCase().includes(search.toLowerCase()));

  // Group by creator
  const grouped = {};
  filtered.forEach(t=>{const k=t.creator?.name||'Org-wide';if(!grouped[k])grouped[k]=[];grouped[k].push(t);});

  // Stats
  const poolCount = active.filter(t=>t.status==='pool').length;
  const claimedCount = active.filter(t=>t.status==='claimed').length;
  const progCount = active.filter(t=>t.status==='in_progress').length;
  const doneCount = active.filter(t=>t.status==='completed').length;
  const rolledCount = active.filter(t=>t.rollover_counter>0).length;

  if(loading) return <div style={{display:'flex',justifyContent:'center',paddingTop:80}}><div style={{width:24,height:24,border:'2px solid var(--indigo)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin .6s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div className="animate-in">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>Tasks</h1>
          <p style={{fontSize:13,color:'var(--fg-2)',marginTop:4}}>
            Grouped by creator. {active.length} tasks this cycle · {poolCount+claimedCount} open · {progCount} running · {doneCount} done.
          </p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn primary" onClick={() => setShowNewTask(true)}><Plus size={14}/> New task</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:6,marginBottom:18,alignItems:'center',flexWrap:'wrap'}}>
        {[['all',`All ${active.length}`],['pool',`Pool ${poolCount}`],['claimed',`Claimed ${claimedCount}`],['inprog',`In progress ${progCount}`],['done',`Done ${doneCount}`],['history',`History ${tasks.filter(t=>t.status==='confirmed').length}`]].map(([k,l])=>(
          <button key={k} className={`btn sm ${statusFilter===k?'primary':''}`} onClick={()=>setStatusFilter(k)}>{l}</button>
        ))}
        {rolledCount>0&&<button className={`btn sm ${statusFilter==='rolled'?'primary':''}`} onClick={()=>setStatusFilter('all')}>
          <Flame size={10}/> Rollover {rolledCount}
        </button>}
        <div style={{flex:1}}/>
        <div style={{display:'flex',alignItems:'center',gap:6,background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'var(--r-btn)',padding:'0 8px',height:30}}>
          <Search size={13} style={{color:'var(--fg-3)'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tasks..."
            style={{background:'transparent',border:'none',outline:'none',color:'var(--fg-0)',fontSize:12,width:140}}/>
        </div>
      </div>

      {/* Creator rows */}
      {Object.keys(grouped).length===0?(
        <div style={{background:'var(--bg-1)',border:'1px solid var(--border)',borderRadius:'var(--r-panel)',padding:60,textAlign:'center'}}>
          <p style={{color:'var(--fg-3)',fontSize:14}}>No tasks found</p>
          <p style={{color:'var(--fg-3)',fontSize:12,marginTop:8}}>Create a task or upload daily reports to generate auto-tasks.</p>
        </div>
      ):(
        Object.entries(grouped).map(([name,ts])=>{
          const rolled = ts.filter(t=>t.rollover_counter>0).length;
          return <CreatorRow key={name} name={name} tasks={ts} rolledCount={rolled} onClaim={onClaim} onTimer={onTimer} onNewTask={()=>toast('Create task modal — coming soon')}/>;
        })
      )}

      {showNewTask && <CreateTaskModal onClose={() => setShowNewTask(false)} onCreated={load} />}
    </div>
  );
}
