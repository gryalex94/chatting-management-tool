import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DISMISS_REASONS } from '../../utils/taskMeta';

const primary = { background: 'var(--indigo)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 'var(--r-btn)', padding: '6px 14px', fontSize: 12, fontWeight: 700 };
const ghost = { background: 'var(--bg-3)', border: '1px solid var(--fg-4)', color: 'var(--fg-1)', borderRadius: 'var(--r-btn)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };

// Single-select reason + optional note. 'other' requires a note.
export default function DismissModal({ task, onClose, onConfirm }) {
  const [code, setCode] = useState(null);
  const [note, setNote] = useState('');
  const needNote = code === 'other';
  const canConfirm = code && (!needNote || note.trim());
  // Portal to body — a transformed ancestor (.animate-in) would otherwise break
  // position:fixed and push the modal off-screen.
  return createPortal((
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-panel)', padding: 20, width: 'min(520px, 92vw)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Why dismiss this?</div>
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 12 }}>
          Helps us improve the AI. {task.creator_name || ''}{task.chatter_name ? ` · ${task.chatter_name}` : ''}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-2)', background: 'var(--bg-2)', borderRadius: 8, padding: '8px 10px', marginBottom: 14, lineHeight: 1.5 }}>{task.detail}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {DISMISS_REASONS.map(r => (
            <button key={r.key} onClick={() => setCode(r.key)}
              style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 700, borderRadius: 'var(--r-btn)', cursor: 'pointer',
                border: `1.5px solid ${code === r.key ? 'var(--indigo)' : 'var(--fg-4)'}`,
                background: code === r.key ? 'var(--indigo-soft)' : 'var(--bg-3)', color: 'var(--fg-0)' }}>
              {r.label}
            </button>
          ))}
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder={needNote ? 'Required — explain why…' : 'Optional note…'}
          style={{ width: '100%', minHeight: 60, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg-0)', fontSize: 12.5, padding: 8, fontFamily: 'var(--ff-sans)', resize: 'vertical' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={ghost}>Cancel</button>
          <button disabled={!canConfirm} onClick={() => onConfirm(code, note.trim())}
            style={{ ...primary, opacity: canConfirm ? 1 : 0.5 }}>Dismiss task</button>
        </div>
      </div>
    </div>
  ), document.body);
}
