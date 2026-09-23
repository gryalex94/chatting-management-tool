import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, Check, CircleCheck, X, Loader2, MessageSquare, Users, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';

const REPORTS = [
  { key:'message-dashboard', label:'Message dashboard', desc:'PPV unlocks, response times, dialogue volume', icon:MessageSquare },
  { key:'creator-stats',     label:'Creator statistics', desc:'Per-creator revenue, subs, fan tiers',       icon:Users },
];

function ReportCard({ report, selected, uploaded, onSelect }) {
  const Icon = report.icon;
  const isUploaded = !!uploaded;
  return (
    <button type='button' onClick={()=>onSelect(report.key)} aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-start transition-colors hover:bg-muted/40',
        selected && 'border-primary ring-1 ring-primary',
      )}>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md border',
        selected ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground')}>
        <Icon className='size-4' />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='text-sm font-medium'>{report.label}</div>
        <div className='mt-0.5 text-xs text-muted-foreground'>{report.desc}</div>
        {isUploaded ? (
          <div className='mt-2.5 flex items-center gap-1.5 text-xs text-good'>
            <span className='size-1.5 rounded-full bg-good' />
            Uploaded · <span className='tabular-nums'>{uploaded.row_count}</span> rows
          </div>
        ) : (
          <div className='mt-2.5 flex items-center gap-1.5 text-xs text-bad'>
            <span className='size-1.5 rounded-full bg-bad' />
            Not uploaded
          </div>
        )}
      </div>
    </button>
  );
}

export default function ReportsPage() {
  const [selected, setSelected] = useState(null);
  const [file, setFile] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploading, setUploading] = useState(false);
  const [imports, setImports] = useState([]);
  const [progress, setProgress] = useState(null);   // daily-tasks pipeline progress

  useEffect(()=>{loadHistory();},[]);

  async function loadHistory() {
    try { const{data}=await api.get('/api/uploads/history'); setImports(data); }
    catch(e){console.error(e?.message || e?.toString?.());}
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
    (key==='creator-stats'&&i.report_type==='creator_statistics')
  );
  const bothReady = getUploaded('message-dashboard')?.status==='completed' && getUploaded('creator-stats')?.status==='completed';

  // One-click daily pipeline (temporary): recompute metrics → AI compliance report
  // per chatter (progress bar) → build & rank tasks — for the selected report date.
  async function createDailyTasks() {
    setProgress({ stage:'calc' });
    try {
      const { data:run } = await api.post('/api/daily-check/run', { report_date:date, recompute:true });
      const chatters = run.chatters || [];
      for (let i=0;i<chatters.length;i++){
        const c = chatters[i];
        setProgress({ stage:'evaluate', done:i, total:chatters.length, current:c.chatter_name });
        try { await api.post('/api/daily-check/evaluate', { chatter_id:c.chatter_id, report_date:date, eval_type:'compliance', model:'sonnet', prompt_version:'A' }); }
        catch { /* skip a chatter that fails, keep going */ }
      }
      setProgress({ stage:'build', done:chatters.length, total:chatters.length });
      await api.post('/api/review-tasks/rebuild', { report_date:date });
      toast.success('Daily tasks created — see them on Home / Tasks');
    } catch(e){ toast.error(e?.response?.data?.error || 'Failed to create daily tasks'); }
    finally { setProgress(null); }
  }

  // Pipeline bar position: same stages/percentages as before.
  const pipelinePct = !progress ? 0
    : progress.stage==='calc' ? 8
      : progress.stage==='build' ? 96
        : (progress.total ? (progress.done/progress.total)*90+5 : 5);

  return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Daily reports</h2>
          <p className='text-muted-foreground'>Upload the Infloww spreadsheets each morning. AI reads them and proposes tasks.</p>
        </div>
        <div className='flex items-center gap-2'>
          <Label htmlFor='report-date' className='font-normal text-muted-foreground'>Report date</Label>
          <Input id='report-date' type='date' value={date} onChange={e=>setDate(e.target.value)} className='h-9 w-auto dark:scheme-dark' />
        </div>
      </div>

      {/* Report type cards */}
      <div className='grid gap-3 sm:grid-cols-2'>
        {REPORTS.map(r=><ReportCard key={r.key} report={r} selected={selected===r.key} uploaded={getUploaded(r.key)} onSelect={setSelected}/>)}
      </div>

      {/* Both reports in → one-click daily pipeline */}
      {bothReady && (
        <div className='rounded-lg border bg-card p-4'>
          {!progress ? (
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
              <div className='flex min-w-0 flex-1 items-start gap-3'>
                <CircleCheck className='mt-0.5 size-5 shrink-0 text-good' />
                <div>
                  <div className='text-sm font-medium'>Both reports uploaded for {date}</div>
                  <div className='mt-0.5 text-xs text-muted-foreground'>Recompute metrics, run the AI report on every chatter, and build the tasks — in one go.</div>
                </div>
              </div>
              <Button onClick={createDailyTasks} className='w-full sm:w-auto'><Sparkles />Create daily tasks</Button>
            </div>
          ) : (
            <div>
              <div className='mb-2 flex items-center justify-between gap-3 text-sm'>
                <span className='flex min-w-0 items-center gap-2'>
                  <Loader2 className='size-4 shrink-0 animate-spin text-muted-foreground' />
                  <span className='truncate'>
                    {progress.stage==='calc' ? 'Recalculating metrics…' : progress.stage==='build' ? 'Building & ranking tasks…' : `Analysing chatters… ${progress.done}/${progress.total}${progress.current ? ` · ${progress.current}` : ''}`}
                  </span>
                </span>
                {progress.total ? <span className='shrink-0 text-xs tabular-nums text-muted-foreground'>{Math.round((progress.done/progress.total)*100)}%</span> : null}
              </div>
              <Progress value={pipelinePct} />
            </div>
          )}
        </div>
      )}

      {/* Upload area */}
      {selected&&(
        <div>
          <div {...getRootProps()} className={cn(
            'cursor-pointer rounded-lg border-2 border-dashed bg-card text-center transition-colors hover:bg-muted/40',
            file ? 'p-5' : 'p-10',
            isDragActive && 'border-primary bg-accent',
          )}>
            <input {...getInputProps()}/>
            {file?(
              <div className='flex items-center justify-center gap-3'>
                <FileSpreadsheet className='size-6 shrink-0 text-good' />
                <div className='min-w-0 text-start'>
                  <div className='truncate text-sm font-medium'>{file.name}</div>
                  <div className='text-xs text-muted-foreground tabular-nums'>{(file.size/1024).toFixed(1)} KB</div>
                </div>
                <Button size='icon-sm' variant='ghost' className='text-bad hover:text-bad' aria-label='Remove file'
                  onClick={e=>{e.stopPropagation();setFile(null);}}><X /></Button>
              </div>
            ):(
              <div className='flex flex-col items-center'>
                <Upload className='mb-2 size-7 text-muted-foreground' />
                <div className='text-sm'>Drop spreadsheet here, or click to browse</div>
                <div className='mt-1 text-xs text-muted-foreground'>.xlsx or .csv</div>
              </div>
            )}
          </div>
          {file&&(
            <Button onClick={handleUpload} disabled={uploading} className='mt-3 w-full'>
              {uploading?<><Loader2 className='animate-spin' />Processing...</>:'Upload & process'}
            </Button>
          )}
        </div>
      )}

      {/* History */}
      {imports.length>0&&(
        <div className='overflow-hidden rounded-lg border bg-card'>
          <div className='border-b px-4 py-3 text-sm font-medium'>Recent imports</div>
          <div className='max-h-[300px] divide-y overflow-auto'>
            {imports.slice(0,20).map(imp=>(
              <div key={imp.id} className='flex items-center justify-between gap-3 px-4 py-2.5'>
                <div className='flex min-w-0 items-center gap-3'>
                  {imp.status==='completed'?<Check className='size-4 shrink-0 text-good' />
                    :imp.status==='failed'?<X className='size-4 shrink-0 text-bad' />
                      :<Loader2 className='size-4 shrink-0 animate-spin text-warn' />}
                  <div className='min-w-0'>
                    <div className='truncate text-sm'>{imp.file_name}</div>
                    <div className='text-xs text-muted-foreground first-letter:uppercase'>{imp.report_type?.replace(/_/g,' ')} · <span className='tabular-nums'>{imp.report_date}</span></div>
                  </div>
                </div>
                <div className='shrink-0 font-mono text-xs text-muted-foreground tabular-nums'>{imp.row_count>0?`${imp.row_count} rows`:imp.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
