import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Avatar, Chip, StatusDot } from '../../components/shared';
import { STATUS_META } from '../../utils/helpers';
import { Plus, Copy, Trash2, Clock, Users, Sparkles } from 'lucide-react';
import { setInflowwOffset, getInflowwOffset } from '../../utils/displaySettings';
import { fmtSentAt } from '../../utils/taskMeta';
import toast from 'react-hot-toast';

function Section({ title, sub, right, children }) {
  return (
    <div style={{ background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden', marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)', gap:8 }}>
        <div><div style={{ fontWeight:600, fontSize:13.5 }}>{title}</div>{sub&&<div style={{ color:'var(--fg-3)', fontSize:11.5, marginTop:2 }}>{sub}</div>}</div>
        <div style={{ flex:1 }}/>{right}
      </div>
      <div style={{ padding:16 }}>{children}</div>
    </div>
  );
}

const inp = { width:'100%', padding:'8px 12px', borderRadius:'var(--r-btn)', fontSize:12.5, outline:'none', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)' };

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
  const [shiftForm, setShiftForm] = useState({ name:'', start_time:'', end_time:'' });
  const [templates, setTemplates] = useState([]);
const [templateForm, setTemplateForm] = useState({ label:'', icon:'📝', title:'', description:'', priority:3 });
const [editingTemplateId, setEditingTemplateId] = useState(null);
const [emojiOpen, setEmojiOpen] = useState(false);
  const [tab, setTab] = useState('creators');
  const [tzOffset, setTzOffset] = useState(getInflowwOffset());
  const [savingTz, setSavingTz] = useState(false);

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
    } catch(e){console.error(e);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{load();},[load]);

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
    try { const {data}=await api.post('/api/auth/invite',inviteForm); setInviteToken(data.invitation.token); toast.success('Invite created'); setInviteForm({email:'',role:'chatter'}); }
    catch(err) { toast.error(err.response?.data?.error||'Failed'); }
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

  const roleColors = { owner:'#6366f1', admin:'#8b5cf6', head_manager:'#3b82f6', manager:'#22c55e', chatter:'#f59e0b', va:'#888' };
  const tabs = [['creators','Creators'],['chatters','Chatters'],['team','Team'],['shifts','Shifts'],['templates','Templates'],['cycles','Cycles']];

  if(loading) return <div style={{display:'flex',justifyContent:'center',paddingTop:80}}><div style={{width:24,height:24,border:'2px solid var(--indigo)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin .6s linear infinite'}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div className="animate-in" style={{maxWidth:800,paddingBottom:80}}>
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:4}}>Settings</h1>
      <p style={{fontSize:13,color:'var(--fg-2)',marginBottom:20}}>Manage your organisation</p>

      {/* Org info */}
      <div style={{display:'flex',gap:12,marginBottom:20}}>
        <div style={{flex:1,padding:16,background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'var(--r-card)'}}>
          <span className="label">Organisation</span>
          <div style={{fontSize:16,fontWeight:600,marginTop:6}}>{user?.organisation?.name}</div>
        </div>
        <div style={{flex:1,padding:16,background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'var(--r-card)'}}>
          <span className="label">Stats</span>
          <div style={{fontSize:13,marginTop:6,color:'var(--fg-2)'}}>{members.length} members · {creators.length} creators · {chatters.length} chatters</div>
        </div>
      </div>

      {/* Infloww time alignment */}
      <div style={{padding:16,background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'var(--r-card)',marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}><Clock size={13} style={{color:'var(--fg-3)'}}/><span className="label">Infloww time alignment</span></div>
        <p style={{fontSize:11.5,color:'var(--fg-3)',marginTop:4,marginBottom:10}}>
          If task timestamps don't match your Infloww chat screen, set the hour offset to align them (e.g. <b>+1</b> during summer time). Applies everywhere times are shown.
        </p>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <input type="number" min={-14} max={14} step={1} value={tzOffset} disabled={!isAdmin}
              onChange={e=>setTzOffset(Number(e.target.value)||0)} style={{...inp,width:80}}/>
            <span style={{fontSize:12.5,color:'var(--fg-2)'}}>hours</span>
          </div>
          <span style={{fontSize:11.5,color:'var(--fg-3)'}}>preview: <b style={{color:'var(--indigo-bright)'}}>{fmtSentAt('2026-06-28T04:20:00+00:00', tzOffset)}</b></span>
          {isAdmin&&<button className="btn sm primary" disabled={savingTz||tzOffset===getInflowwOffset()} onClick={()=>saveTzOffset(tzOffset)}>{savingTz?'Saving…':'Save'}</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16}}>
        {tabs.map(([k,l])=><button key={k} className={`btn sm ${tab===k?'primary':''}`} onClick={()=>setTab(k)}>{l}</button>)}
      </div>

      {/* Creators */}
      {tab==='creators'&&(
        <Section title="Creators" sub={`${creators.length} creator accounts`} right={isAdmin&&<span style={{fontSize:11,color:'var(--fg-3)'}}>Admin only</span>}>
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}>
            {creators.map(c=>(
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'var(--r-tile)'}}>
                <Avatar name={c.name} size={24}/><span style={{fontSize:12.5,fontWeight:500}}>{c.name}</span>
              </div>
            ))}
          </div>
          {isAdmin&&<form onSubmit={addCreator} style={{display:'flex',gap:8}}>
            <input value={creatorName} onChange={e=>setCreatorName(e.target.value)} placeholder="Creator name" style={{...inp,flex:1}}/>
            <button type="submit" className="btn primary sm"><Plus size={12}/> Add</button>
          </form>}
        </Section>
      )}

      {/* Chatters */}
      {tab==='chatters'&&(
        <Section title="Chatters" sub={`${chatters.length} chatters in your org`}>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
            {chatters.map(ch=>{
              const meta=STATUS_META[ch.status]||STATUS_META.new;
              return (
                <div key={ch.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'var(--r-tile)'}}>
                  <Avatar name={ch.name} size={28}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12.5,fontWeight:500}}>{ch.name}</div>
                    <div style={{fontSize:10.5,color:'var(--fg-3)'}}>{ch.email||'no email'}</div>
                  </div>
                  <div style={{display:'flex',gap:4}}>
                    {Object.entries(STATUS_META).map(([k,v])=>(
                      <button key={k} onClick={()=>updateChatterStatus(ch.id,k)}
                        style={{width:10,height:10,borderRadius:'50%',background:v.color,border:'none',cursor:'pointer',
                          opacity:ch.status===k?1:0.3,transform:ch.status===k?'scale(1.4)':'scale(1)',transition:'all .12s'}}
                        title={v.label}/>
                    ))}
                  </div>
                  <button className="btn sm ghost" style={{color:'var(--bad)',marginLeft:8}} onClick={async()=>{
                    if(!confirm(`Deactivate ${ch.name}?`)) return;
                    try { await api.put(`/api/chatters/${ch.id}`,{is_active:false}); toast.success('Deactivated'); load(); }
                    catch { toast.error('Failed'); }
                  }}>✕</button>
                </div>
              );
            })}
          </div>
          <form onSubmit={addChatter} style={{display:'flex',gap:8}}>
            <input value={chatterForm.name} onChange={e=>setChatterForm(p=>({...p,name:e.target.value}))} placeholder="Name" required style={{...inp,flex:1}}/>
            <input value={chatterForm.email} onChange={e=>setChatterForm(p=>({...p,email:e.target.value}))} placeholder="Email (optional)" style={{...inp,flex:1}}/>
            <button type="submit" className="btn primary sm"><Plus size={12}/> Add</button>
          </form>
        </Section>
      )}

      {/* Team */}
      {tab==='team'&&(
        <Section title="Team Members" sub={`${members.length} people with access`}>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
            {members.map(m=>(
              <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'var(--bg-2)',borderRadius:'var(--r-tile)'}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:roleColors[m.role]}}/>
                <span style={{fontSize:12.5,fontWeight:500,flex:1}}>{m.name}</span>
                <span style={{fontSize:11,color:'var(--fg-3)'}}>{m.role.replace('_',' ')}</span>
              </div>
            ))}
          </div>
          {isAdmin&&(<>
            <div className="label" style={{marginBottom:8}}>Create new member</div>
            <form onSubmit={async(e)=>{
              e.preventDefault();
              try {
                await api.post('/api/auth/create-member', memberForm);
                toast.success(`${memberForm.name} created! They can log in with the password you set.`);
                setMemberForm({name:'',email:'',password:'',role:'chatter'});
                load();
              } catch(err) { toast.error(err.response?.data?.error||'Failed'); }
            }} style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <input value={memberForm.name} onChange={e=>setMemberForm(p=>({...p,name:e.target.value}))} required placeholder="Full name" style={inp}/>
                <input value={memberForm.email} onChange={e=>setMemberForm(p=>({...p,email:e.target.value}))} type="email" required placeholder="email@example.com" style={inp}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <input value={memberForm.password} onChange={e=>setMemberForm(p=>({...p,password:e.target.value}))} type="password" required minLength={6} placeholder="Password (min 6 chars)" style={inp}/>
                <select value={memberForm.role} onChange={e=>setMemberForm(p=>({...p,role:e.target.value}))} style={inp}>
                  <option value="chatter">Chatter</option>
                  <option value="va">VA</option>
                  <option value="manager">Manager</option>
                  <option value="head_manager">Head Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn primary sm" style={{alignSelf:'flex-start'}}>Create member</button>
            </form>
          </>)}
        </Section>
      )}

      {/* Shifts */}
      {tab==='shifts'&&(
        <Section title="Shifts" sub={`${shifts.length} shifts configured`}>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
            {shifts.map(s=>(
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'var(--r-tile)'}}>
                <Clock size={14} style={{color:'var(--fg-3)'}}/>
                <span style={{fontSize:12.5,fontWeight:500,flex:1}}>{s.name}</span>
                <span className="mono" style={{fontSize:11,color:'var(--fg-2)'}}>{s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}</span>
                {s.is_default&&<Chip style={{height:18,fontSize:10}}>default</Chip>}
                <span style={{fontSize:10.5,color:'var(--fg-3)'}}>{s.shift_type}</span>
              </div>
            ))}
          </div>
          {isAdmin&&<form onSubmit={addShift} style={{display:'flex',gap:8}}>
            <input value={shiftForm.name} onChange={e=>setShiftForm(p=>({...p,name:e.target.value}))} placeholder="Shift name" required style={{...inp,flex:1}}/>
            <input value={shiftForm.start_time} onChange={e=>setShiftForm(p=>({...p,start_time:e.target.value}))} type="time" required style={{...inp,width:100}}/>
            <input value={shiftForm.end_time} onChange={e=>setShiftForm(p=>({...p,end_time:e.target.value}))} type="time" required style={{...inp,width:100}}/>
            <button type="submit" className="btn primary sm"><Plus size={12}/> Add</button>
          </form>}
        </Section>
      )}

      {/* Cycles */}
      {tab==='templates'&&(
        <Section title="Task Templates" sub={`${templates.length} templates — used in the New Task modal`}>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
            {templates.map(t=>(
              <div key={t.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:editingTemplateId===t.id?'var(--indigo-soft)':'var(--bg-2)',border:`1px solid ${editingTemplateId===t.id?'var(--indigo-line)':'var(--border)'}`,borderRadius:'var(--r-tile)',transition:'all .12s'}}>
                <span style={{fontSize:16}}>{t.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:500}}>{t.label}</div>
                  <div style={{fontSize:10.5,color:'var(--fg-3)',marginTop:1}}>{t.title} — {t.description?.slice(0,60)}{t.description?.length>60?'...':''}</div>
                </div>
                <span className="mono" style={{fontSize:10,color:'var(--fg-3)'}}>P{t.priority}</span>
                <button className="btn sm ghost" onClick={()=>{
                  setEditingTemplateId(t.id);
                  setTemplateForm({label:t.label,icon:t.icon,title:t.title,description:t.description||'',priority:t.priority});
                }}>✎</button>
                <button className="btn sm ghost" style={{color:'var(--bad)'}} onClick={async()=>{
                  if(!confirm(`Remove "${t.label}"?`)) return;
                  try{await api.delete(`/api/tasks/templates/${t.id}`);toast.success('Removed');load();}
                  catch{toast.error('Failed');}
                }}>✕</button>
              </div>
            ))}
            {templates.length===0&&<div style={{padding:20,textAlign:'center',color:'var(--fg-3)',fontSize:12}}>No templates yet</div>}
          </div>
          {isAdmin&&(<>
            <div className="label" style={{marginBottom:8}}>Add template</div>
            <form onSubmit={async(e)=>{
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
                setTemplateForm({label:'',icon:'📝',title:'',description:'',priority:3});load();
              } catch{toast.error('Failed');}
            }} style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{display:'grid',gridTemplateColumns:'60px 1fr 1fr',gap:8}}>
                <div style={{position:'relative'}}>
  <button type="button" onClick={()=>setEmojiOpen(!emojiOpen)} style={{...inp,width:60,textAlign:'center',fontSize:16,cursor:'pointer'}}>{templateForm.icon}</button>
  {emojiOpen&&<div style={{position:'absolute',bottom:'100%',left:0,marginBottom:4,padding:8,background:'var(--bg-2)',border:'1px solid var(--border)',borderRadius:'var(--r-card)',boxShadow:'var(--shadow-raised)',zIndex:20,display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:4,width:260}}>
    {['📝','✅','🔍','📋','💬','🎤','🧑‍💼','📤','🐋','📊','⚠️','🔥','📞','📅','🎯','💰','📸','🛠️','📌','💡','🚀','👀','🔔','⏰','📦','🏆','❌','✏️','🤝','📈','🧹','💳'].map(e=>(
      <button key={e} type="button" onClick={()=>{setTemplateForm(p=>({...p,icon:e}));setEmojiOpen(false);}}
        style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,background:'transparent',border:'1px solid transparent',borderRadius:6,cursor:'pointer',transition:'all .1s'}}
        onMouseEnter={ev=>ev.currentTarget.style.background='var(--bg-3)'}
        onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>{e}</button>
    ))}
  </div>}
</div>
                <input value={templateForm.label} onChange={e=>setTemplateForm(p=>({...p,label:e.target.value}))} required placeholder="Button label (e.g. Hiring)" style={inp}/>
                <input value={templateForm.title} onChange={e=>setTemplateForm(p=>({...p,title:e.target.value}))} required placeholder="Pre-filled title" style={inp}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 80px',gap:8}}>
                <input value={templateForm.description} onChange={e=>setTemplateForm(p=>({...p,description:e.target.value}))} placeholder="Pre-filled description" style={inp}/>
                <select value={templateForm.priority} onChange={e=>setTemplateForm(p=>({...p,priority:parseInt(e.target.value)}))} style={inp}>
                  <option value={1}>P1 Urgent</option>
                  <option value={2}>P2 High</option>
                  <option value={3}>P3 Medium</option>
                  <option value={4}>P4 Low</option>
                </select>
              </div>
              <div style={{display:'flex',gap:8}}>
  <button type="submit" className="btn primary sm">{editingTemplateId?'Save changes':'Add template'}</button>
  {editingTemplateId&&<button type="button" className="btn sm" onClick={()=>{setEditingTemplateId(null);setTemplateForm({label:'',icon:'📝',title:'',description:'',priority:3});}}>Cancel</button>}
</div>
            </form>
          </>)}
        </Section>
      )}
      {tab==='cycles'&&(
        <Section title="Weekly Cycles" sub="Manage task cycles">
          <div style={{display:'flex',gap:8}}>
            <button className="btn primary" onClick={async()=>{try{await api.post('/api/cycles/start');toast.success('Cycle started');load();}catch{toast.error('Failed');}}}>
              <Plus size={14}/> Start new cycle
            </button>
            <button className="btn" onClick={async()=>{
              try{
                const{data:active}=await api.get('/api/cycles/active');
                if(!active) return toast.error('No active cycle');
                await api.post(`/api/cycles/${active.id}/close`);
                toast.success('Week closed! Tasks rolled over.');load();
              }catch{toast.error('Failed');}
            }}>Close week</button>
          </div>
        </Section>
      )}
    </div>
  );
}
