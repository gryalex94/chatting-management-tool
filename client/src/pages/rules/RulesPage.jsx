import { useCallback, useEffect, useState } from 'react';
import { BookCheck, ChevronRight, CircleAlert, Loader2, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { areaMeta } from '@/utils/taskMeta';
import PageContextFields, { CONTEXT_FIELDS, cleanContext } from '@/components/shared/PageContextFields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const ALL = '__all';
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

/**
 * AI Rules: what the daily review always follows. The managers' dismissal notes
 * are drafted into rules every Monday (server/src/ai/houseRules.js); nothing is
 * used until the owner approves it here. Page facts (what a page has, can't do,
 * where else she exists) live here too, since the review treats them the same way.
 */
export default function RulesPage() {
  const { user } = useAuth();
  const canEdit = ['admin', 'owner'].includes(user?.role);
  const [info, setInfo] = useState(null);
  const [drafting, setDrafting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [factsFor, setFactsFor] = useState(null);

  const load = useCallback(() => {
    api.get('/api/ai-rules').then(r => setInfo(r.data)).catch(() => setInfo({ error: true }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const draft = async () => {
    setDrafting(true);
    try {
      const { data } = await api.post('/api/ai-rules/draft');
      toast.success(data.read
        ? `Read ${data.read} dismissal${data.read === 1 ? '' : 's'}: ${data.proposed ? `${data.proposed} rule${data.proposed === 1 ? '' : 's'} to review` : 'nothing new to learn'}`
        : 'No new dismissals to read');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Drafting failed');
    } finally { setDrafting(false); }
  };

  // One call for every change to a rule; the list reloads after.
  const change = async (rule, body, done) => {
    try {
      await api.patch(`/api/ai-rules/${rule.id}`, body);
      toast.success(done);
      load();
      return true;
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not update the rule'); return false; }
  };
  const remove = async (rule) => {
    try { await api.delete(`/api/ai-rules/${rule.id}`); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Could not delete the rule'); }
  };
  const add = async (body) => {
    try { await api.post('/api/ai-rules', body); toast.success('Rule added. The next review uses it'); setAdding(false); load(); return true; }
    catch (e) { toast.error(e?.response?.data?.error || 'Could not save the rule'); return false; }
  };
  const saveFacts = async (page, ctx, text) => {
    try {
      await api.put(`/api/creators/${page.id}`, { ai_context: cleanContext(ctx), ai_instructions: text.trim() || null });
      toast.success(`${page.name}: facts saved`);
      setFactsFor(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save'); }
  };

  const header = (
    <div className='flex flex-wrap items-end justify-between gap-3'>
      <div className='min-w-0'>
        <h2 className='text-2xl font-bold tracking-tight'>AI rules</h2>
        <p className='max-w-3xl text-muted-foreground'>
          What the daily review always follows. Each Monday your manager&apos;s dismissals and notes are drafted into rules;
          nothing is used until you approve it.
        </p>
      </div>
      {canEdit && info?.ready && (
        <div className='flex flex-col items-end gap-1'>
          <Button variant='outline' onClick={draft} disabled={drafting}>
            {drafting ? <Loader2 className='animate-spin' /> : <Sparkles />}
            {drafting ? 'Reading the notes…' : 'Draft from new feedback'}
          </Button>
          <span className='text-xs text-muted-foreground'>
            {info.new_feedback ? `${info.new_feedback} new dismissal${info.new_feedback === 1 ? '' : 's'} to read` : 'No new dismissals'} · last read {fmtDate(info.drafted_at)}
          </span>
        </div>
      )}
    </div>
  );

  if (!info) {
    return (
      <div className='flex flex-col gap-6'>{header}
        <div className='grid gap-3'>{[0, 1, 2].map(i => <Skeleton key={i} className='h-20 w-full' />)}</div>
      </div>
    );
  }
  if (info.error) return <div className='flex flex-col gap-6'>{header}<p className='text-sm text-muted-foreground'>Could not load the rules.</p></div>;

  const pages = (info.pages || []).filter(p => p.is_active !== false);
  const pageName = Object.fromEntries((info.pages || []).map(p => [p.id, p.name]));
  const rules = info.rules || [];
  const proposed = rules.filter(r => r.status === 'proposed');
  const active = rules.filter(r => r.status === 'active');
  const past = rules.filter(r => r.status === 'rejected' || r.status === 'retired');
  const byId = Object.fromEntries(rules.map(r => [r.id, r]));
  const activeGroups = [
    { key: ALL, title: 'All pages', list: active.filter(r => !r.creator_id) },
    ...pages.map(p => ({ key: p.id, title: p.name, list: active.filter(r => r.creator_id === p.id) })),
  ].filter(g => g.list.length);

  return (
    <div className='flex flex-col gap-8'>
      {header}

      {!info.ready && (
        <div className='flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm'>
          <CircleAlert className='mt-0.5 size-4 shrink-0 text-warn' />
          <span>{info.message || 'Rules are not set up yet.'} The page facts below already work.</span>
        </div>
      )}

      {info.ready && (
        <section className='grid gap-3'>
          <SectionTitle title='Waiting for your approval' count={proposed.length} />
          {proposed.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              Nothing waiting. New proposals appear here after Monday&apos;s draft{canEdit ? ', or when you draft from new feedback' : ''}.
            </p>
          ) : proposed.map(r => (
            <ProposedRule key={r.id} rule={r} pages={pages} pageName={pageName} replaced={r.replaces ? byId[r.replaces] : null} canEdit={canEdit}
              onApprove={(edits) => change(r, { action: 'approve', ...edits }, 'Approved. The next review uses it')}
              onReject={() => change(r, { action: 'reject' }, 'Rejected')} />
          ))}
        </section>
      )}

      {info.ready && (
        <section className='grid gap-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <SectionTitle title='In use' count={active.length} />
            {canEdit && !adding && <Button size='sm' variant='outline' onClick={() => setAdding(true)}><Plus />Add a rule</Button>}
          </div>
          {adding && <RuleEditor pages={pages} onCancel={() => setAdding(false)} onSave={(body) => add(body)} saveLabel='Add rule' />}
          {activeGroups.length === 0 && !adding && (
            <p className='text-sm text-muted-foreground'>No rules in use yet. Approve a proposal above{canEdit ? ', or add one yourself' : ''}.</p>
          )}
          {activeGroups.map(g => (
            <div key={g.key} className='overflow-hidden rounded-lg border bg-card'>
              <div className='border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>{g.title}</div>
              <ul className='divide-y'>
                {g.list.map(r => (
                  <ActiveRule key={r.id} rule={r} pages={pages} canEdit={canEdit}
                    onSave={(edits) => change(r, { action: 'edit', ...edits }, 'Saved')}
                    onRetire={() => change(r, { action: 'retire' }, 'Retired. The review no longer uses it')} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className='grid gap-3'>
        <SectionTitle title='Page facts' />
        <p className='-mt-1 max-w-3xl text-sm text-muted-foreground'>
          Facts about each page that the review treats as true: content she has or can&apos;t make, other places she legitimately exists.
        </p>
        <div className='grid gap-3 sm:grid-cols-2'>
          {pages.map(p => <PageFacts key={p.id} page={p} canEdit={canEdit} onEdit={() => setFactsFor(p)} />)}
        </div>
      </section>

      {info.ready && past.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant='ghost' size='sm' className='group w-fit gap-1.5 px-2 text-muted-foreground'>
              <ChevronRight className='transition-transform group-data-[state=open]:rotate-90' />
              Rejected and retired ({past.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className='mt-2 divide-y overflow-hidden rounded-lg border bg-card'>
              {past.map(r => (
                <li key={r.id} className='flex flex-wrap items-start justify-between gap-3 px-4 py-3'>
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm text-muted-foreground line-through decoration-muted-foreground/40'>{r.rule}</p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {r.status === 'rejected' ? 'Rejected' : 'Retired'} {fmtDate(r.decided_at)} · {r.creator_id ? pageName[r.creator_id] || 'a page' : 'All pages'}
                    </p>
                  </div>
                  {canEdit && (
                    <div className='flex gap-1.5'>
                      <Button size='sm' variant='outline' onClick={() => change(r, { action: 'restore' }, r.status === 'rejected' ? 'Back in the approval list' : 'Back in use')}>
                        <RotateCcw />{r.status === 'rejected' ? 'Reconsider' : 'Use again'}
                      </Button>
                      <Button size='icon-sm' variant='ghost' aria-label='Delete for good' onClick={() => remove(r)}><Trash2 /></Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      {factsFor && <FactsDialog page={factsFor} onClose={() => setFactsFor(null)} onSave={saveFacts} />}
    </div>
  );
}

function SectionTitle({ title, count }) {
  return (
    <h3 className='flex items-center gap-2 text-base font-semibold'>
      {title}
      {count > 0 && <Badge variant='secondary' className='tabular-nums'>{count}</Badge>}
    </h3>
  );
}

function ScopeSelect({ value, pages, onChange, disabled, id }) {
  return (
    <Select value={value || ALL} onValueChange={v => onChange(v === ALL ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} className='h-8 w-44 text-xs'><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All pages</SelectItem>
        {pages.map(p => <SelectItem key={p.id} value={p.id}>{p.name} only</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function AreaBadge({ area }) {
  if (!area) return null;
  const m = areaMeta(area);
  return (
    <Badge variant='outline' className='gap-1 font-normal'>
      <span className='size-1.5 rounded-full' style={{ backgroundColor: m.c }} />{m.label}
    </Badge>
  );
}

// A drafted rule: the wording and the page can be changed before approving.
function ProposedRule({ rule, pages, pageName, replaced, canEdit, onApprove, onReject }) {
  const [text, setText] = useState(rule.rule);
  const [scope, setScope] = useState(rule.creator_id || null);
  const [busy, setBusy] = useState(false);
  const notes = Array.isArray(rule.based_on) ? rule.based_on : [];
  const run = async (fn) => { setBusy(true); await fn(); setBusy(false); };
  const edited = text.trim() !== rule.rule || (scope || null) !== (rule.creator_id || null);
  return (
    <div className='grid gap-3 rounded-lg border bg-card p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <AreaBadge area={rule.area} />
        <span className='text-xs text-muted-foreground'>Drafted {fmtDate(rule.created_at)}</span>
      </div>
      {canEdit ? (
        <Textarea id={`rule-${rule.id}`} value={text} onChange={e => setText(e.target.value)} rows={2} className='text-sm leading-relaxed' />
      ) : <p className='text-sm leading-relaxed'>{rule.rule}</p>}
      {rule.why && <p className='text-sm text-muted-foreground'>{rule.why}</p>}
      {replaced && (
        <p className='rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground'>
          Replaces the rule now in use: <span className='italic'>{replaced.rule}</span>
        </p>
      )}
      {notes.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant='ghost' size='sm' className='group -ms-2 w-fit gap-1.5 px-2 text-xs text-muted-foreground'>
              <ChevronRight className='transition-transform group-data-[state=open]:rotate-90' />
              Based on {notes.length} dismissal{notes.length === 1 ? '' : 's'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className='mt-1 grid gap-2'>
              {notes.map(n => (
                <li key={n.task_id} className='rounded-md border px-3 py-2 text-xs leading-relaxed'>
                  <div className='flex flex-wrap items-center gap-1.5 text-muted-foreground'>
                    <span>{n.date}</span>{n.page && <span>· {n.page}</span>}<AreaBadge area={n.area} /><span>· {n.reason}</span>
                  </div>
                  {n.note && <p className='mt-1 font-medium'>&ldquo;{n.note}&rdquo;</p>}
                  {n.finding && <p className='mt-1 text-muted-foreground'>Finding: {n.finding}</p>}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {canEdit && (
        <div className='flex flex-wrap items-center gap-2'>
          <ScopeSelect id={`scope-${rule.id}`} value={scope} pages={pages} onChange={setScope} disabled={busy} />
          <Button size='sm' disabled={busy || text.trim().length < 3}
            onClick={() => run(() => onApprove(edited ? { rule: text.trim(), creator_id: scope } : {}))}>
            <BookCheck />{edited ? 'Save and approve' : 'Approve'}
          </Button>
          <Button size='sm' variant='outline' disabled={busy} onClick={() => run(onReject)}>Reject</Button>
          {scope && pageName[scope] && (
            <span className='text-xs text-muted-foreground'>Used only on {pageName[scope]}&apos;s conversations</span>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveRule({ rule, pages, canEdit, onSave, onRetire }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className='p-3'>
        <RuleEditor pages={pages} initial={rule} saveLabel='Save' onCancel={() => setEditing(false)}
          onSave={async (body) => { const ok = await onSave(body); if (ok) setEditing(false); return ok; }} />
      </li>
    );
  }
  return (
    <li className='flex flex-wrap items-start justify-between gap-3 px-4 py-3'>
      <div className='min-w-0 flex-1'>
        <p className='text-sm leading-relaxed'>{rule.rule}</p>
        <div className='mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
          <AreaBadge area={rule.area} />
          <span>{rule.source === 'drafted' ? 'From your feedback' : 'Added by hand'} · since {fmtDate(rule.decided_at || rule.created_at)}</span>
        </div>
      </div>
      {canEdit && (
        <div className='flex gap-1.5'>
          <Button size='icon-sm' variant='ghost' aria-label='Edit rule' onClick={() => setEditing(true)}><Pencil /></Button>
          <Button size='sm' variant='outline' onClick={onRetire}>Retire</Button>
        </div>
      )}
    </li>
  );
}

// Write or edit a rule: the wording and which pages it applies to.
function RuleEditor({ pages, initial = null, saveLabel, onSave, onCancel }) {
  const [text, setText] = useState(initial?.rule || '');
  const [scope, setScope] = useState(initial?.creator_id || null);
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); await onSave({ rule: text.trim(), creator_id: scope }); setBusy(false); };
  return (
    <div className='grid gap-2 rounded-lg border bg-card p-3'>
      <Textarea id={initial ? `edit-${initial.id}` : 'new-rule'} autoFocus value={text} onChange={e => setText(e.target.value)} rows={2}
        placeholder="e.g. Don't flag a follow-up message after a PPV as pushy: following up is the right move."
        className='text-sm leading-relaxed' />
      <div className='flex flex-wrap items-center gap-2'>
        <ScopeSelect id={initial ? `edit-scope-${initial.id}` : 'new-rule-scope'} value={scope} pages={pages} onChange={setScope} disabled={busy} />
        <Button size='sm' disabled={busy || text.trim().length < 3} onClick={save}>{busy ? 'Saving…' : saveLabel}</Button>
        <Button size='sm' variant='ghost' disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function PageFacts({ page, canEdit, onEdit }) {
  const ctx = page.ai_context && typeof page.ai_context === 'object' ? page.ai_context : {};
  const rows = CONTEXT_FIELDS.filter(f => String(ctx[f.key] || '').trim()).map(f => [f.label, ctx[f.key]]);
  if (page.ai_instructions) rows.push(['Anything else', page.ai_instructions]);
  return (
    <div className='grid content-start gap-2 rounded-lg border bg-card p-4'>
      <div className='flex items-center justify-between gap-2'>
        <span className='font-medium'>{page.name}</span>
        {canEdit && <Button size='sm' variant='ghost' onClick={onEdit}><Pencil />Edit</Button>}
      </div>
      {rows.length ? (
        <dl className='grid gap-1.5 text-sm'>
          {rows.map(([label, v]) => (
            <div key={label} className='min-w-0'>
              <dt className='text-xs text-muted-foreground'>{label}</dt>
              <dd className='break-words leading-relaxed'>{v}</dd>
            </div>
          ))}
        </dl>
      ) : <p className='text-sm text-muted-foreground'>No facts yet.</p>}
    </div>
  );
}

function FactsDialog({ page, onClose, onSave }) {
  const [ctx, setCtx] = useState(() => (page.ai_context && typeof page.ai_context === 'object' ? { ...page.ai_context } : {}));
  const [text, setText] = useState(page.ai_instructions || '');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{page.name}: page facts</DialogTitle>
          <DialogDescription>Used whenever this page&apos;s conversations are reviewed.</DialogDescription>
        </DialogHeader>
        <PageContextFields ctx={ctx} setCtx={setCtx} text={text} setText={setText} disabled={busy} />
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); await onSave(page, ctx, text); setBusy(false); }}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
