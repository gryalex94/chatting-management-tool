import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Check, FileSpreadsheet, Loader2, MessagesSquare, Upload, UserRound, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { yesterday } from '@/utils/dates';

const reportTypes = [
  { key: 'message-dashboard', label: 'Message Dashboard', desc: 'Chat logs with all messages', icon: MessagesSquare },
  { key: 'creator-stats', label: 'Creator Statistics', desc: 'Creator-level revenue & ratios', icon: UserRound },
];

export default function UploadsPage() {
  const [selectedType, setSelectedType] = useState(null);
  const [file, setFile] = useState(null);
  const [reportDate, setReportDate] = useState(yesterday());
  const [uploading, setUploading] = useState(false);
  const [imports, setImports] = useState([]);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    try {
      const { data } = await api.get('/api/uploads/history');
      setImports(data);
    } catch (err) {
      console.error('History load error:', err?.message || err?.toString?.());
    }
  }

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  async function handleUpload() {
    if (!file || !selectedType || !reportDate) {
      toast.error('Select a report type, file, and date');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('report_date', reportDate);

    try {
      const { data } = await api.post(`/api/uploads/${selectedType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('File uploaded and processing started!');
      setFile(null);
      setSelectedType(null);

      // Poll for completion
      if (data.importId) {
        pollStatus(data.importId);
      }
      loadHistory();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function pollStatus(importId) {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const { data } = await api.get(`/api/uploads/status/${importId}`);
        if (data.status === 'completed') {
          clearInterval(interval);
          toast.success(`Processing complete! ${data.row_count} rows imported.`);
          loadHistory();
        } else if (data.status === 'failed') {
          clearInterval(interval);
          toast.error(`Processing failed: ${data.error_message}`);
          loadHistory();
        } else if (attempts > 60) {
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 3000);
  }

  const statusIcon = {
    processing: <Loader2 className='size-4 animate-spin text-warn' aria-label='Processing' />,
    completed: <Check className='size-4 text-good' aria-label='Completed' />,
    failed: <X className='size-4 text-bad' aria-label='Failed' />,
  };

  return (
    <div className='flex flex-col gap-4 sm:gap-6'>
      <div>
        <h2 className='text-2xl font-bold tracking-tight'>Upload reports</h2>
        <p className='text-muted-foreground'>Import daily spreadsheets for analysis</p>
      </div>

      {/* Step 1: Select report type */}
      <div className='grid gap-3 sm:grid-cols-2'>
        {reportTypes.map(rt => {
          const on = selectedType === rt.key;
          return (
            <button key={rt.key} type='button' onClick={() => setSelectedType(rt.key)} aria-pressed={on}
              className={cn('flex items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent',
                on && 'border-primary ring-1 ring-primary')}>
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground', on && 'bg-primary text-primary-foreground')}>
                <rt.icon className='size-4' />
              </span>
              <span>
                <span className='block text-sm font-medium'>{rt.label}</span>
                <span className='mt-0.5 block text-sm text-muted-foreground'>{rt.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Step 2: Date + File */}
      {selectedType && (
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label htmlFor='report-date'>Report date</Label>
            <Input id='report-date' type='date' value={reportDate} onChange={(e) => setReportDate(e.target.value)} className='w-auto tabular-nums' />
          </div>

          <div
            {...getRootProps()}
            className={cn('cursor-pointer rounded-lg border-2 border-dashed bg-card p-8 text-center transition-colors hover:bg-accent/50',
              isDragActive && 'border-primary bg-primary/5')}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className='flex items-center justify-center gap-3'>
                <FileSpreadsheet className='size-6 shrink-0 text-good' />
                <div className='min-w-0 text-left'>
                  <p className='truncate text-sm font-medium'>{file.name}</p>
                  <p className='text-xs text-muted-foreground tabular-nums'>{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <Button type='button' size='icon-sm' variant='ghost' className='text-muted-foreground hover:text-bad' aria-label='Remove file'
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                  <X />
                </Button>
              </div>
            ) : (
              <div>
                <Upload className='mx-auto mb-2 size-8 text-muted-foreground' />
                <p className='text-sm'>Drop your spreadsheet here, or click to browse</p>
                <p className='mt-1 text-xs text-muted-foreground'>.xlsx or .csv</p>
              </div>
            )}
          </div>

          {file && (
            <Button onClick={handleUpload} disabled={uploading} size='lg' className='w-full'>
              {uploading ? <><Loader2 className='animate-spin' />Uploading…</> : 'Upload and process'}
            </Button>
          )}
        </div>
      )}

      {/* Upload history */}
      {imports.length > 0 && (
        <div className='grid gap-3'>
          <h3 className='font-semibold'>Recent imports</h3>
          <div className='divide-y overflow-hidden rounded-lg border bg-card'>
            {imports.slice(0, 20).map(imp => (
              <div key={imp.id} className='flex items-center justify-between gap-3 px-4 py-3'>
                <div className='flex min-w-0 items-center gap-3'>
                  <span className='shrink-0'>{statusIcon[imp.status]}</span>
                  <div className='min-w-0'>
                    <p className='truncate text-sm'>{imp.file_name}</p>
                    <p className='text-xs capitalize text-muted-foreground'>
                      {imp.report_type?.replace('_', ' ')} · <span className='tabular-nums'>{imp.report_date}</span>
                    </p>
                  </div>
                </div>
                <div className='shrink-0 text-right'>
                  <p className='text-xs text-muted-foreground tabular-nums'>
                    {imp.row_count > 0 ? `${imp.row_count} rows` : imp.status}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {imp.users?.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
