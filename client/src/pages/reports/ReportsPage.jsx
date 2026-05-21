import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import api from '../../services/api';
import { Chip } from '../../components/shared';
import { Upload, FileSpreadsheet, Check, X, Loader2, MessageSquare, BarChart3, Users } from 'lucide-react';
import toast from 'react-hot-toast';

const REPORTS = [
  { key:'message-dashboard', label:'Message Dashboard', desc:'PPV unlocks, response times, dialogue volume', icon:MessageSquare, color:'var(--indigo)' },
  { key:'employee-report',   label:'Employee Report',   desc:'Per-chatter shift attendance + productivity', icon:BarChart3, color:'var(--good)' },
  { key:'creator-stats',     label:'Creator Statistics', desc:'Per-creator revenue, subs, fan tiers',       icon:Users, color:'var(--warn)' },
];

function ReportCard({ report, selected, uploaded, onSelect }) {
  const Icon = report.icon;
  const isUploaded = !!uploaded;
  return (
    <div onClick={()=>onSelect(report.key)} style={{
      flex:1, padding:16, background:selected?report.color:'var(--bg-2)',
      border:`1px solid ${selected?report.color:'var(--border)'}`,
      borderRadius:'var(--r-card)', cursor:'pointer', transition:'all .12s',
      color: selected?'white':'var(--fg-0)',
    }}>
      <Icon size={20} style={{marginBottom:8,opacity:0.8}}/>
      <div style={{fontSize:13,fontWeight:600}}>{report.label}</div>
      <div style={{fontSize:11,marginTop:4,opacity:0.7}}>{report.desc}</div>
      {isUploaded&&(
        <div style={{marginTop:10,display:'flex',alignItems:'center',gap:6,fontSize:11}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:selected?'white':'var(--good)'}}/>
          Uploaded · {uploaded.row_count} rows
        </div>
      )}
      {!isUploaded&&(
        <div style={{marginTop:10,display:'flex',alignItems:'center',gap:6,fontSize:11,color:selected?'rgba(255,255,255,0.7)':'var(--bad)'}}>
          <span style={{width:6,height:6,borderRadius:'50%',background:'var(--bad)'}}/>
          Not uploaded
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [selected, setSelected] = useState(null);
  const [file, setFile] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploading, setUploading] = useState(false);
  const [imports, setImports] = useState([]);

  useEffect(()=>{loadHistory();},[]);

  async function loadHistory() {
    try { const{data}=await api.get('/api/uploads/history'); setImports(data); }
    catch(e){console.error(e);}
  }

  const{getRootProps,getInputProps,isDragActive}=useDropzone({
    onDrop:files=>{if(files.length>0)setFile(files[0]);},
    accept:{'text/csv':['.csv'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']},
    maxFiles:1,
  });

  async function handleUpload() {
    if(!file||!selected||!date) return toast.error('Select type, date, and file');
    setUploading(true);
    const fd=new FormData(); fd.append('file',file); fd.append('report_date',date);
    try {
      const{data}=await api.post(`/api/uploads/${selected}`,fd,{headers:{'Content-Type':'multipart/form-data'}});
      toast.success('Processing started!');
      setFile(null);
      if(data.importId) pollStatus(data.importId);
      loadHistory();
    } catch(err) { toast.error(err.response?.data?.error||'Upload failed'); }
    finally { setUploading(false); }
  }

  async function pollStatus(id) {
    let n=0;
    const iv=setInterval(async()=>{
      n++; if(n>60){clearInterval(iv);return;}
      try {
        const{data}=await api.get(`/api/uploads/status/${id}`);
        if(data.status==='completed'){clearInterval(iv);toast.success(`Done! ${data.row_count} rows imported.`);loadHistory();}
        if(data.status==='failed'){clearInterval(iv);toast.error(`Failed: ${data.error_message}`);loadHistory();}
      } catch{}
    },3000);
  }

  const todayImports = imports.filter(i=>i.report_date===date);
  const getUploaded = key => todayImports.find(i=>
    (key==='message-dashboard'&&i.report_type==='message_dashboard')||
    (key==='employee-report'&&i.report_type==='employee_report')||
    (key==='creator-stats'&&i.report_type==='creator_statistics')
  );

  return (
    <div className="animate-in">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700}}>Daily Reports</h1>
          <p style={{fontSize:13,color:'var(--fg-2)',marginTop:4}}>Upload three spreadsheets each morning. AI reads them and proposes tasks.</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:12,color:'var(--fg-3)'}}>Report date:</span>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{padding:'6px 10px',borderRadius:'var(--r-btn)',fontSize:12,background:'var(--bg-2)',border:'1px solid var(--border)',color:'var(--fg-0)',outline:'none'}}/>
        </div>
      </div>

      {/* Report type cards */}
      <div style={{display:'flex',gap:12,marginBottom:24}}>
        {REPORTS.map(r=><ReportCard key={r.key} report={r} selected={selected===r.key} uploaded={getUploaded(r.key)} onSelect={setSelected}/>)}
      </div>

      {/* Upload area */}
      {selected&&(
        <div className="animate-in" style={{marginBottom:24}}>
          <div {...getRootProps()} style={{
            padding:file?20:40, borderRadius:'var(--r-panel)', textAlign:'center', cursor:'pointer',
            background:isDragActive?'var(--indigo-soft)':'var(--bg-2)',
            border:`2px dashed ${isDragActive?'var(--indigo)':'var(--border)'}`,
            transition:'all .12s',
          }}>
            <input {...getInputProps()}/>
            {file?(
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12}}>
                <FileSpreadsheet size={24} style={{color:'var(--good)'}}/>
                <div style={{textAlign:'left'}}>
                  <div style={{fontSize:13,fontWeight:500}}>{file.name}</div>
                  <div style={{fontSize:11,color:'var(--fg-3)'}}>{(file.size/1024).toFixed(1)} KB</div>
                </div>
                <button onClick={e=>{e.stopPropagation();setFile(null);}} className="btn sm ghost" style={{color:'var(--bad)'}}><X size={14}/></button>
              </div>
            ):(
              <div>
                <Upload size={28} style={{color:'var(--fg-3)',marginBottom:8}}/>
                <div style={{fontSize:13,color:'var(--fg-2)'}}>Drop spreadsheet here, or click to browse</div>
                <div style={{fontSize:11,color:'var(--fg-3)',marginTop:4}}>.xlsx or .csv</div>
              </div>
            )}
          </div>
          {file&&<button onClick={handleUpload} disabled={uploading} className="btn primary" style={{width:'100%',height:38,justifyContent:'center',marginTop:12}}>
            {uploading?<><Loader2 size={14} className="pulse-live"/> Processing...</>:'Upload & Process'}
          </button>}
        </div>
      )}

      {/* History */}
      {imports.length>0&&(
        <div style={{background:'var(--bg-1)',border:'1px solid var(--border)',borderRadius:'var(--r-panel)',overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',fontWeight:600,fontSize:13.5}}>Recent imports</div>
          <div style={{maxHeight:300,overflow:'auto'}}>
            {imports.slice(0,20).map(imp=>(
              <div key={imp.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:'1px solid var(--border-soft)'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  {imp.status==='completed'?<Check size={14} style={{color:'var(--good)'}}/>:imp.status==='failed'?<X size={14} style={{color:'var(--bad)'}}/>:<Loader2 size={14} className="pulse-live" style={{color:'var(--warn)'}}/>}
                  <div>
                    <div style={{fontSize:12.5}}>{imp.file_name}</div>
                    <div style={{fontSize:10.5,color:'var(--fg-3)'}}>{imp.report_type?.replace(/_/g,' ')} · {imp.report_date}</div>
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="mono" style={{fontSize:11,color:'var(--fg-2)'}}>{imp.row_count>0?`${imp.row_count} rows`:imp.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
