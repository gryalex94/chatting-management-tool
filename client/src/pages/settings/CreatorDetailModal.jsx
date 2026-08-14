import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { Avatar } from '../../components/shared';
import PageContextFields, { cleanContext } from '../../components/shared/PageContextFields';
import { Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

const inp = {
  width:'100%', padding:'8px 10px', fontSize:13, background:'var(--bg-2)',
  border:'1px solid var(--border)', borderRadius:'var(--r-tile)', color:'var(--fg-0)',
  outline:'none', fontFamily:'inherit',
};

/**
 * Everything about one creator page in one place: identity, the AI context used
 * when reviewing its dialogues, and removal. Lives in Settings rather than the
 * shift board because a page's conditions belong to the page, not to whichever
 * shift happens to be covering it — one shift often runs several pages, and each
 * of those pages has different rules.
 */
export default function CreatorDetailModal({ creator, isAdmin, onClose, onChanged }) {
  const [name, setName] = useState(creator.name);
  const [ctx, setCtx] = useState(() => ({ ...(creator.ai_context || {}) }));
  const [text, setText] = useState(creator.ai_instructions || '');
  const [usage, setUsage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api.get(`/api/creators/${creator.id}/usage`).then(r => setUsage(r.data)).catch(() => setUsage(null));
  }, [creator.id]);

  const dirty = name !== creator.name
    || text !== (creator.ai_instructions || '')
    || JSON.stringify(cleanContext(ctx)) !== JSON.stringify(creator.ai_context || null);

  async function save() {
    setSaving(true);
    try {
      await api.put(`/api/creators/${creator.id}`, {
        name: name.trim() || creator.name,
        ai_instructions: text.trim(),
        ai_context: cleanContext(ctx),
      });
      toast.success('Saved');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  }

  async function remove() {
    try {
      await api.delete(`/api/creators/${creator.id}`);
      toast.success(`${creator.name} deleted`);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete');
    }
  }

  async function deactivate() {
    try {
      await api.put(`/api/creators/${creator.id}`, { is_active: false });
      toast.success(`${creator.name} deactivated`);
      onChanged();
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  }

  return createPortal((
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width:'min(580px, 96vw)', maxHeight:'88vh', background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:'var(--r-panel)', overflow:'hidden', display:'flex', flexDirection:'column' }}>

        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
          <Avatar name={creator.name} size={32}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:15 }}>{creator.name}</div>
            <div style={{ fontSize:11.5, color:'var(--fg-3)' }}>
              {usage
                ? `${usage.messages.toLocaleString()} messages · ${usage.daily_stats} stat days · ${usage.tasks} tasks`
                : 'loading history…'}
            </div>
          </div>
        </div>

        <div style={{ padding:16, overflow:'auto' }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--fg-1)', marginBottom:5 }}>Page name</div>
          <input value={name} onChange={e => setName(e.target.value)} disabled={!isAdmin} style={{ ...inp, marginBottom:18 }}/>

          <div style={{ fontSize:13, fontWeight:700, color:'var(--fg-0)', marginBottom:2 }}>AI page context</div>
          <div style={{ height:1, background:'var(--border)', margin:'8px 0 12px' }}/>
          <PageContextFields ctx={ctx} setCtx={setCtx} text={text} setText={setText} disabled={!isAdmin}/>

          {isAdmin && (
            <>
              <div style={{ height:1, background:'var(--border)', margin:'20px 0 12px' }}/>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--bad)', marginBottom:8 }}>Danger zone</div>
              {usage && !usage.deletable ? (
                <div style={{ display:'flex', gap:8, alignItems:'flex-start', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:'var(--r-tile)', padding:'10px 12px' }}>
                  <AlertTriangle size={14} style={{ color:'var(--warn, #f59e0b)', flexShrink:0, marginTop:1 }}/>
                  <div style={{ fontSize:11.5, color:'var(--fg-2)', lineHeight:1.5 }}>
                    This page carries history, so it can't be deleted — every message, stat and task
                    points back at it. Deactivating hides it everywhere and keeps the history intact.
                    <div style={{ marginTop:8 }}>
                      <button className="btn sm ghost" onClick={deactivate}>Deactivate page</button>
                    </div>
                  </div>
                </div>
              ) : confirmDelete ? (
                <div style={{ background:'var(--bg-2)', border:'1px solid var(--bad)', borderRadius:'var(--r-tile)', padding:'10px 12px' }}>
                  <div style={{ fontSize:11.5, color:'var(--fg-1)', marginBottom:8 }}>
                    Delete <b>{creator.name}</b> permanently? It has no messages, stats or tasks, so nothing is lost.
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn sm ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                    <button className="btn sm" style={{ background:'var(--bad)', color:'#fff' }} onClick={remove}>Yes, delete</button>
                  </div>
                </div>
              ) : (
                <button className="btn sm ghost" style={{ color:'var(--bad)', display:'inline-flex', alignItems:'center', gap:6 }}
                  onClick={() => setConfirmDelete(true)}><Trash2 size={13}/> Delete this page</button>
              )}
            </>
          )}
        </div>

        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn sm ghost" onClick={onClose}>Close</button>
          {isAdmin && (
            <button className="btn sm" disabled={!dirty || saving}
              style={{ background:'var(--indigo)', color:'#fff', opacity: (!dirty || saving) ? 0.5 : 1 }}
              onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}
