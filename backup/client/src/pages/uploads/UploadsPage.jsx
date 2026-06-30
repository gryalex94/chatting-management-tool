import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import api from '../../services/api';
import { Upload, FileSpreadsheet, Check, X, Loader2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const reportTypes = [
  { key: 'message-dashboard', label: 'Message Dashboard', desc: 'Chat logs with all messages', icon: '💬' },
  { key: 'employee-report', label: 'Employee Report', desc: 'Chatter performance stats', icon: '📊' },
  { key: 'creator-stats', label: 'Creator Statistics', desc: 'Creator-level metrics', icon: '👤' },
];

export default function UploadsPage() {
  const [selectedType, setSelectedType] = useState(null);
  const [file, setFile] = useState(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploading, setUploading] = useState(false);
  const [imports, setImports] = useState([]);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    try {
      const { data } = await api.get('/api/uploads/history');
      setImports(data);
    } catch (err) {
      console.error('History load error:', err);
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
    processing: <Loader2 size={14} className="animate-spin" style={{ color: 'var(--warning)' }} />,
    completed: <Check size={14} style={{ color: 'var(--success)' }} />,
    failed: <X size={14} style={{ color: 'var(--danger)' }} />,
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Upload Reports</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Import daily spreadsheets for analysis</p>

      {/* Step 1: Select report type */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {reportTypes.map(rt => (
          <button
            key={rt.key}
            onClick={() => setSelectedType(rt.key)}
            className="rounded-xl p-4 text-left transition-all duration-200"
            style={{
              background: selectedType === rt.key ? 'var(--accent)' : 'var(--bg-card)',
              border: `1px solid ${selectedType === rt.key ? 'var(--accent)' : 'var(--border)'}`,
              color: selectedType === rt.key ? '#fff' : 'var(--text-primary)',
            }}
          >
            <span className="text-lg">{rt.icon}</span>
            <h3 className="text-sm font-medium mt-2">{rt.label}</h3>
            <p className="text-xs mt-0.5" style={{ opacity: 0.7 }}>{rt.desc}</p>
          </button>
        ))}
      </div>

      {/* Step 2: Date + File */}
      {selectedType && (
        <div className="animate-fade-in">
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Report Date</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div
            {...getRootProps()}
            className="rounded-xl p-8 text-center cursor-pointer transition-all duration-200"
            style={{
              background: isDragActive ? 'var(--accent)10' : 'var(--bg-card)',
              border: `2px dashed ${isDragActive ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet size={24} style={{ color: 'var(--success)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{file.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="p-1 rounded" style={{ color: 'var(--danger)' }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div>
                <Upload size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Drop your spreadsheet here, or click to browse
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>.xlsx or .csv</p>
              </div>
            )}
          </div>

          {file && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="mt-4 w-full py-3 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ background: uploading ? 'var(--border)' : 'var(--accent)' }}
            >
              {uploading ? 'Uploading...' : 'Upload & Process'}
            </button>
          )}
        </div>
      )}

      {/* Upload history */}
      {imports.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Recent Imports</h2>
          <div className="flex flex-col gap-2">
            {imports.slice(0, 20).map(imp => (
              <div
                key={imp.id}
                className="flex items-center justify-between rounded-lg px-4 py-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-3">
                  {statusIcon[imp.status]}
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{imp.file_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {imp.report_type?.replace('_', ' ')} · {imp.report_date}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {imp.row_count > 0 ? `${imp.row_count} rows` : imp.status}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
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
