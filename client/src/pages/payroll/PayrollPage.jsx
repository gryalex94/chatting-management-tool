import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, Copy, FileDown, ImageDown, Loader2, Lock, LockOpen, RefreshCw, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import PlatformBadge from '@/components/shared/PlatformBadge';
import {
  copyCanvas, canvasBlob, drawReport, fmtDay, hoursText, money, pdfFromCanvases, periodTitle, saveBlob,
} from './reportImage';
import { usePlatform } from '@/context/PlatformContext';
import { platformInfo } from '@/utils/platforms';

const errMsg = (e, d) => e?.response?.data?.error || d;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v, d) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
// The same sums as the server (utils/payroll.js), to preview edits before saving:
// the OnlyFans part (the report's own columns), each other platform's line, and
// everything added up.
function lineTotals(l) {
  const hours = num(l.hours, num(l.hours_auto, 0));
  const overtime = num(l.overtime_hours, num(l.overtime_hours_auto, 0));
  const otRate = num(l.overtime_rate, num(l.hourly_rate, 0));
  const net = r2(num(l.sales_net, 0));
  const commission = r2(net * num(l.commission_pct, 0) / 100);
  const hourly = r2(hours * num(l.hourly_rate, 0));
  const otPay = r2(overtime * otRate);
  return {
    hours_paid: hours, overtime_paid: overtime, hourly_rate: num(l.hourly_rate, 0), commission_pct: num(l.commission_pct, 0), overtime_rate_paid: otRate,
    sales_gross: r2(num(l.sales_gross, 0)), sales_net: net, commission, hourly_pay: hourly, overtime_pay: otPay, pay: r2(commission + hourly + otPay),
  };
}
function totals(row) {
  const hours = num(row.hours, num(row.hours_auto, 0));
  const overtime = num(row.overtime_hours, num(row.overtime_hours_auto, 0));
  const otRate = num(row.overtime_rate, num(row.hourly_rate, 0));
  const net = r2(num(row.sales_gross, 0) * (100 - num(row.of_cut_pct, 20)) / 100);
  const commission = r2(net * num(row.commission_pct, 0) / 100);
  const hourly = r2(hours * num(row.hourly_rate, 0));
  const otPay = r2(overtime * otRate);
  const platforms = Object.entries(row.lines || {}).filter(([, l]) => l && typeof l === 'object').map(([platform, l]) => ({ platform, ...lineTotals(l) }));
  const extra = (k) => platforms.reduce((sum, x) => sum + x[k], 0);
  return {
    hours_paid: hours, overtime_paid: overtime, overtime_rate_paid: otRate, sales_net: net, commission, hourly_pay: hourly, overtime_pay: otPay,
    platforms,
    all: {
      hours: r2(hours + extra('hours_paid')), overtime: r2(overtime + extra('overtime_paid')),
      sales_gross: r2(num(row.sales_gross, 0) + extra('sales_gross')), sales_net: r2(net + extra('sales_net')),
      commission: r2(commission + extra('commission')), hourly_pay: r2(hourly + extra('hourly_pay')), overtime_pay: r2(otPay + extra('overtime_pay')),
    },
    total: r2(commission + hourly + otPay + extra('pay') + num(row.additions, 0) - num(row.deductions, 0)),
  };
}
// Every platform added up.
const allOf = (r) => r.all || totals(r).all;
// Whether the report has an OnlyFans part: hours or sales there, or no other platform.
const onOnlyFans = (r) => !(r.platforms || []).length || r.hours_paid + r.overtime_paid > 0 || Number(r.sales_gross) > 0;
// Under a figure in the table: the same figure for each platform the person worked
// on ("OnlyFans 80", "Fanvue 16"), one per line.
function PerPlatform({ r, of, other }) {
  const parts = [...(onOnlyFans(r) ? [['OnlyFans', of]] : []), ...(r.platforms || []).map(l => [platformInfo(l.platform).name, other(l)])];
  return <div className='text-xs text-muted-foreground'>{parts.map(([name, v]) => <div key={name} className='whitespace-nowrap'>{name} {v}</div>)}</div>;
}
const fileName = (row, period, ext) => `Payroll ${row.chatter_name} ${periodTitle(period)}.${ext}`;
const stamp = (ts) => (ts ? new Date(ts).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const FLAG = {
  default_rate: { label: 'default rate', tone: 'text-muted-foreground' },
  short_shifts: { label: 'short shift', tone: 'border-warn/40 text-warn' },
  no_infloww_account: { label: 'no Infloww account', tone: 'border-bad/40 text-bad' },
};

/**
 * Payroll: what each chatter earned in a two-week period, and the report they're
 * sent every second Monday (server/src/utils/payroll.js). Sales come fresh from
 * Infloww, hours from the chat history; the manager checks each report, adds
 * additions, deductions or notes, downloads it (picture or PDF) and marks it final.
 */
export default function PayrollPage() {
  const [start, setStart] = useState(null);           // the period shown; null = the last finished one
  const [data, setData] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [rates, setRates] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`/api/payroll${start ? `?start=${start}` : ''}`)
    .then(r => setData(r.data)).catch(e => setData({ error: errMsg(e, 'Could not load the payroll'), status: e?.response?.status })), [start]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => data?.rows || [], [data]);
  const period = data?.period;
  const open = rows.find(r => r.id === openId) || null;
  const sum = useMemo(() => rows.reduce((s, r) => {
    const a = allOf(r);
    return {
      hours: s.hours + a.hours + a.overtime, sales: s.sales + a.sales_gross, commission: s.commission + a.commission,
      hourly: s.hourly + a.hourly_pay, overtime: s.overtime + a.overtime_pay,
      additions: s.additions + Number(r.additions), deductions: s.deductions + Number(r.deductions), total: s.total + r.total,
    };
  }, { hours: 0, sales: 0, commission: 0, hourly: 0, overtime: 0, additions: 0, deductions: 0, total: 0 }), [rows]);
  const finals = rows.filter(r => r.status === 'final').length;

  const calculate = async () => {
    setCalculating(true);
    try {
      await api.post('/api/payroll/calculate', { start: period.start });
      await load();
      toast.success('Payroll calculated');
    } catch (e) { toast.error(errMsg(e, 'Could not calculate')); }
    finally { setCalculating(false); }
  };
  const replaceRow = (row) => setData(d => ({ ...d, rows: d.rows.map(r => (r.id === row.id ? { ...r, ...row } : r)) }));
  const finalizeAll = async () => {
    setBusy(true);
    try { await api.post('/api/payroll/finalize', { start: period.start }); await load(); toast.success('All reports are final'); }
    catch (e) { toast.error(errMsg(e, 'Could not finalize')); }
    finally { setBusy(false); }
  };
  const downloadAll = async () => {
    setBusy(true);
    try { saveBlob(await pdfFromCanvases(rows.map(r => drawReport(r, period))), `Payroll ${periodTitle(period)}.pdf`); }
    catch (e) { toast.error(e.message || 'Could not make the PDF'); }
    finally { setBusy(false); }
  };

  const header = (
    <div className='flex flex-wrap items-end justify-between gap-3'>
      <div className='min-w-0'>
        <h2 className='text-2xl font-bold tracking-tight'>Payroll</h2>
        <p className='max-w-3xl text-muted-foreground'>
          What each chatter earned, for the report they get every second Monday, on every platform. OnlyFans sales come from Infloww and hours from the chat history; Fanvue from its roster and sales.
        </p>
      </div>
      {data?.periods && (
        <div className='flex flex-wrap items-center gap-2'>
          <Select value={period?.start} onValueChange={(v) => { setStart(v); setOpenId(null); }}>
            <SelectTrigger className='w-72' aria-label='Payroll period'><SelectValue /></SelectTrigger>
            <SelectContent>
              {data.periods.map(p => (
                <SelectItem key={p.start} value={p.start}>
                  {periodTitle(p)}{p.running ? ' · running' : ''}{p.reports ? (p.final === p.reports ? ' · final' : ` · ${p.reports} reports`) : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant='outline' onClick={() => setRates(true)}><Settings2 />Pay rates</Button>
          {rows.length > 0 && (
            <Button variant='outline' onClick={calculate} disabled={calculating}>
              {calculating ? <Loader2 className='animate-spin' /> : <RefreshCw />}Recalculate
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (!data) return <div className='flex flex-col gap-6'>{header}<div className='grid gap-3'>{[0, 1, 2].map(i => <Skeleton key={i} className='h-14 w-full' />)}</div></div>;
  if (data.error) {
    return (
      <div className='flex flex-col gap-6'>
        {header}
        <div className='flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm'>
          <CircleAlert className='mt-0.5 size-4 shrink-0 text-warn' />
          <span>{data.status === 403 ? 'Only managers can see the payroll.' : data.error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-6'>
      {header}

      <div className='flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground'>
        <span>
          {fmtDay(period.start)} 00:00 – {fmtDay(period.end)} 23:59 CET · paid {fmtDay(period.payday)}
          {data.calculated_at ? ` · calculated ${stamp(data.calculated_at)}` : ''}
        </span>
        {rows.length > 0 && (
          <div className='flex flex-wrap gap-2'>
            <Button size='sm' variant='outline' onClick={downloadAll} disabled={busy}><FileDown />Download all (PDF)</Button>
            {finals < rows.length && <Button size='sm' variant='outline' onClick={finalizeAll} disabled={busy}><Lock />Mark all final</Button>}
          </div>
        )}
      </div>

      {data.warnings?.length > 0 && (
        <div className='flex flex-col gap-1.5 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm'>
          {data.warnings.map((w, i) => (
            <div key={i} className='flex items-start gap-2'><CircleAlert className='mt-0.5 size-4 shrink-0 text-warn' /><span>{w}</span></div>
          ))}
        </div>
      )}

      {!rows.length ? (
        <div className='flex flex-col items-start gap-3 rounded-lg border border-dashed p-6'>
          <p className='text-sm text-muted-foreground'>
            {data.calculated_at ? 'Nobody worked or sold in this period.' : 'Not calculated yet. This reads the sales from Infloww and the hours from the chats, and takes about 15 seconds.'}
          </p>
          <Button onClick={calculate} disabled={calculating}>
            {calculating ? <><Loader2 className='animate-spin' />Calculating…</> : <><RefreshCw />Calculate</>}
          </Button>
        </div>
      ) : (
        <div className='overflow-x-auto rounded-lg border bg-card'>
          <table className='w-full min-w-[960px] border-collapse text-sm'>
            <thead>
              <tr className='border-b bg-muted/40 text-left text-xs text-muted-foreground'>
                <th className='px-3 py-2 font-medium'>Chatter</th>
                <th className='px-3 py-2 text-right font-medium'>Hours</th>
                <th className='px-3 py-2 text-right font-medium'>Sales</th>
                <th className='px-3 py-2 text-right font-medium'>Commission</th>
                <th className='px-3 py-2 text-right font-medium'>Hourly pay</th>
                <th className='px-3 py-2 text-right font-medium'>Overtime</th>
                <th className='px-3 py-2 text-right font-medium'>Additions</th>
                <th className='px-3 py-2 text-right font-medium'>Deductions</th>
                <th className='px-3 py-2 text-right font-medium'>Total</th>
                <th className='px-3 py-2 font-medium'>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => { const a = allOf(r), multi = (r.platforms || []).length > 0; return (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className='cursor-pointer border-b align-top last:border-b-0 hover:bg-muted/40'>
                  <td className='px-3 py-2'>
                    <button type='button' className='text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>
                      {r.chatter_name}
                    </button>
                    <div className='mt-1 flex flex-wrap gap-1'>
                      {(r.details?.flags || []).map(f => FLAG[f] && <Badge key={f} variant='outline' className={cn('font-normal', FLAG[f].tone)}>{FLAG[f].label}</Badge>)}
                    </div>
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>
                    {hoursText(a.hours + a.overtime)}
                    {multi
                      ? <PerPlatform r={r} of={hoursText(r.hours_paid + r.overtime_paid)} other={l => hoursText(l.hours_paid + l.overtime_paid)} />
                      : r.overtime_paid > 0 && <div className='text-xs text-muted-foreground'>{hoursText(r.hours_paid)} + {hoursText(r.overtime_paid)} overtime</div>}
                    {(r.hours != null || r.overtime_hours != null || Object.values(r.lines || {}).some(l => l?.hours != null || l?.overtime_hours != null)) && <div className='text-xs text-muted-foreground'>edited</div>}
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>
                    {money(a.sales_gross)}
                    {multi && <PerPlatform r={r} of={money(r.sales_gross)} other={l => money(l.sales_gross)} />}
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>
                    {money(a.commission)}
                    {multi ? <PerPlatform r={r} of={money(r.commission)} other={l => money(l.commission)} /> : <div className='text-xs text-muted-foreground'>{num(r.commission_pct, 0)}% of {money(r.sales_net)}</div>}
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>
                    {money(a.hourly_pay)}
                    {multi ? <PerPlatform r={r} of={`${money(r.hourly_rate)}/h`} other={l => `${money(l.hourly_rate)}/h`} /> : <div className='text-xs text-muted-foreground'>{money(r.hourly_rate)}/h</div>}
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>
                    {a.overtime_pay > 0 ? <>{money(a.overtime_pay)}{multi ? <PerPlatform r={r} of={money(r.overtime_pay)} other={l => money(l.overtime_pay)} /> : <div className='text-xs text-muted-foreground'>{hoursText(r.overtime_paid)} h × {money(r.overtime_rate_paid)}</div>}</> : '–'}
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>{Number(r.additions) ? money(r.additions) : '–'}</td>
                  <td className='px-3 py-2 text-right tabular-nums'>{Number(r.deductions) ? money(r.deductions) : '–'}</td>
                  <td className='px-3 py-2 text-right font-semibold tabular-nums'>{money(r.total)}</td>
                  <td className='px-3 py-2'>
                    {r.status === 'final' ? <Badge variant='secondary' className='gap-1'><Lock className='size-3' />Final</Badge> : <Badge variant='outline'>Draft</Badge>}
                  </td>
                </tr>
              ); })}
            </tbody>
            <tfoot>
              <tr className='border-t bg-muted/30 font-medium'>
                <td className='px-3 py-2'>{rows.length} chatters</td>
                <td className='px-3 py-2 text-right tabular-nums'>{hoursText(sum.hours)}</td>
                <td className='px-3 py-2 text-right tabular-nums'>{money(sum.sales)}</td>
                <td className='px-3 py-2 text-right tabular-nums'>{money(sum.commission)}</td>
                <td className='px-3 py-2 text-right tabular-nums'>{money(sum.hourly)}</td>
                <td className='px-3 py-2 text-right tabular-nums'>{money(sum.overtime)}</td>
                <td className='px-3 py-2 text-right tabular-nums'>{money(sum.additions)}</td>
                <td className='px-3 py-2 text-right tabular-nums'>{money(sum.deductions)}</td>
                <td className='px-3 py-2 text-right tabular-nums'>{money(sum.total)}</td>
                <td className='px-3 py-2 text-xs text-muted-foreground'>{finals}/{rows.length} final</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {open && (
        <ReportDialog key={open.id} row={open} period={period} onClose={() => setOpenId(null)} onSaved={replaceRow} />
      )}
      {rates && <PayRatesDialog used={[...new Set(rows.flatMap(r => Object.keys(r.lines || {})))]} onClose={() => setRates(false)} onSaved={() => { setRates(false); load(); }} />}
    </div>
  );
}

const FIELDS = ['hours', 'overtime_hours', 'hourly_rate', 'overtime_rate', 'commission_pct', 'additions', 'deductions', 'notes'];
const formOf = (row) => Object.fromEntries(FIELDS.map(k => [k, row[k] === null || row[k] === undefined ? '' : String(k === 'notes' ? row[k] : Number(row[k]))]));
// another platform's line (Fanvue): its hours and rates, as typed
const LINE_FIELDS = ['hours', 'overtime_hours', 'hourly_rate', 'overtime_rate', 'commission_pct'];
const linesOf = (row) => Object.fromEntries(Object.entries(row.lines || {}).filter(([, l]) => l && typeof l === 'object')
  .map(([p, l]) => [p, Object.fromEntries(LINE_FIELDS.map(k => [k, l[k] === null || l[k] === undefined ? '' : String(Number(l[k]))]))]));
const orNull = (v) => (v === '' ? null : v);
const shiftsText = (n) => `${n} shift${n === 1 ? '' : 's'}`;

// One platform's hours and rates in the report window. Empty hours use the counted
// ones (shown greyed out).
function PartFields({ id, title, values, set, auto, hoursHint, ratesHint, onUseAuto, disabled }) {
  const typed = values.hours !== '' || values.overtime_hours !== '';
  return (
    <div className='grid grid-cols-2 gap-3'>
      {title && <span className='col-span-2 flex items-center gap-2 text-sm font-medium'>{title}</span>}
      <div className='grid gap-1.5'>
        <Label htmlFor={`${id}-hours`}>Regular hours</Label>
        <Input id={`${id}-hours`} type='number' min='0' step='0.5' inputMode='decimal' value={values.hours} onChange={set('hours')} placeholder={hoursText(auto.hours)} disabled={disabled} />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={`${id}-ot-hours`}>Overtime hours</Label>
        <Input id={`${id}-ot-hours`} type='number' min='0' step='0.5' inputMode='decimal' value={values.overtime_hours} onChange={set('overtime_hours')} placeholder={hoursText(auto.overtime)} disabled={disabled} />
      </div>
      <p className='col-span-2 -mt-1 text-xs text-muted-foreground'>
        {hoursHint} Empty uses those.
        {typed && !disabled && <button type='button' className='ms-1 text-link hover:underline' onClick={onUseAuto}>Use them</button>}
      </p>
      <div className='grid gap-1.5'>
        <Label htmlFor={`${id}-rate`}>Hourly rate ($)</Label>
        <Input id={`${id}-rate`} type='number' min='0' step='0.25' inputMode='decimal' value={values.hourly_rate} onChange={set('hourly_rate')} disabled={disabled} />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={`${id}-ot-rate`}>Overtime rate ($)</Label>
        <Input id={`${id}-ot-rate`} type='number' min='0' step='0.25' inputMode='decimal' value={values.overtime_rate} onChange={set('overtime_rate')} placeholder='Same as hourly' disabled={disabled} />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={`${id}-commission`}>Commission (%)</Label>
        <Input id={`${id}-commission`} type='number' min='0' max='100' step='0.5' inputMode='decimal' value={values.commission_pct} onChange={set('commission_pct')} disabled={disabled} />
      </div>
      <p className='col-span-2 -mt-1 text-xs text-muted-foreground'>{ratesHint}</p>
    </div>
  );
}

// One chatter's report: the picture as it will be sent, what the manager can
// change, and the downloads.
function ReportDialog({ row, period, onClose, onSaved }) {
  const [form, setForm] = useState(() => formOf(row));
  const [lineForm, setLineForm] = useState(() => linesOf(row));   // platform -> its hours and rates as typed
  const [saving, setSaving] = useState(false);
  const final = row.status === 'final';
  const saved = formOf(row);
  const savedLines = linesOf(row);
  // per platform, what was changed here
  const lineChanges = Object.fromEntries(Object.entries(lineForm)
    .map(([p, f]) => [p, Object.fromEntries(LINE_FIELDS.filter(k => f[k] !== savedLines[p]?.[k]).map(k => [k, orNull(f[k])]))])
    .filter(([, c]) => Object.keys(c).length));
  const dirty = FIELDS.some(k => form[k] !== saved[k]) || Object.keys(lineChanges).length > 0;
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setLine = (p) => (k) => (e) => setLineForm(f => ({ ...f, [p]: { ...f[p], [k]: e.target.value } }));

  // what the report looks like with the changes typed so far
  const draft = useMemo(() => {
    const lines = Object.fromEntries(Object.entries(row.lines || {})
      .map(([p, l]) => [p, lineForm[p] ? { ...l, ...Object.fromEntries(LINE_FIELDS.map(k => [k, orNull(lineForm[p][k])])) } : l]));
    const d = { ...row, ...form, hours: orNull(form.hours), overtime_hours: orNull(form.overtime_hours), overtime_rate: orNull(form.overtime_rate), notes: form.notes || null, lines };
    return { ...d, ...totals(d) };
  }, [row, form, lineForm]);
  const preview = useMemo(() => drawReport(draft, period).toDataURL('image/png'), [draft, period]);
  const shifts = row.details?.shifts || [];
  const otShifts = shifts.filter(s => s.overtime ?? !s.whole);
  const short = shifts.filter(s => s.whole && s.active_min < 420);
  const cut = shifts.filter(s => !s.whole && !(s.overtime ?? !s.whole));
  const flags = row.details?.flags || [];
  const others = Object.keys(lineForm);
  const ownRates = row.own_rates || { onlyfans: !flags.includes('default_rate') };
  const ratesHint = (p) => {
    const name = others.length ? ` ${platformInfo(p).name}` : '';
    return `${ownRates[p] ? `This chatter's own${name} rates.` : `This chatter has no${name} rates of their own yet: these are the team's.`} A rate changed here is saved for their next reports too. All rates: Pay rates.`;
  };

  const save = async () => {
    setSaving(true);
    try {
      // only what changed: a rate is saved as the chatter's own only when it's changed here
      const body = Object.fromEntries(FIELDS.filter(k => form[k] !== saved[k]).map(k => [k, k === 'notes' ? form.notes : form[k] === '' ? null : form[k]]));
      if (Object.keys(lineChanges).length) body.lines = lineChanges;
      const { data } = await api.patch(`/api/payroll/reports/${row.id}`, body);
      onSaved(data);
      return data;
    } catch (e) { toast.error(errMsg(e, 'Could not save')); return null; }
    finally { setSaving(false); }
  };
  // downloads always use what's saved: save first if something was changed
  const current = async () => (dirty && !final ? save() : row);
  const withCanvas = (fn) => async () => {
    const r = await current();
    if (!r) return;
    try { await fn(drawReport(r, period), r); }
    catch (e) { toast.error(e.message || 'Something went wrong'); }
  };
  const setStatus = async (toFinal) => {
    if (toFinal && dirty && !(await save())) return;
    setSaving(true);
    try { const { data } = await api.post(`/api/payroll/reports/${row.id}/status`, { final: toFinal }); onSaved(data); toast.success(toFinal ? 'Marked final' : 'Back to draft'); }
    catch (e) { toast.error(errMsg(e, 'Could not change it')); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className='max-h-[92vh] overflow-y-auto sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {row.chatter_name}
            {final ? <Badge variant='secondary' className='gap-1'><Lock className='size-3' />Final</Badge> : <Badge variant='outline'>Draft</Badge>}
          </DialogTitle>
          <DialogDescription>{periodTitle(period)}. {final ? 'Final: the numbers no longer change.' : 'Check the numbers, add anything extra, then download and send.'}</DialogDescription>
        </DialogHeader>

        <div className='grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]'>
          <img src={preview} alt={`Payroll report for ${row.chatter_name}`} className='w-full rounded-md border' />

          <div className='flex flex-col gap-4'>
            <PartFields id='pay' title={others.length > 0 && <><PlatformBadge platform='onlyfans' />OnlyFans</>} values={form} set={set} disabled={final}
              auto={{ hours: row.hours_auto, overtime: row.overtime_hours_auto }}
              hoursHint={`From the chats: ${hoursText(row.hours_auto)} h in ${shiftsText(shifts.length - otShifts.length)}${Number(row.overtime_hours_auto) > 0 ? ` + ${hoursText(row.overtime_hours_auto)} h overtime` : ''}.`}
              onUseAuto={() => setForm(f => ({ ...f, hours: '', overtime_hours: '' }))} ratesHint={ratesHint('onlyfans')} />
            {others.map(p => {
              const l = row.lines[p], name = platformInfo(p).name;
              return (
                <PartFields key={p} id={`pay-${p}`} title={<><PlatformBadge platform={p} />{name}</>} values={lineForm[p]} set={setLine(p)} disabled={final}
                  auto={{ hours: l.hours_auto, overtime: l.overtime_hours_auto }}
                  hoursHint={`From the ${name} roster: ${hoursText(l.hours_auto)} h in ${shiftsText((l.shifts || []).filter(x => !x.overtime && x.hours > 0).length)}${Number(l.overtime_hours_auto) > 0 ? ` + ${hoursText(l.overtime_hours_auto)} h overtime` : ''}.`}
                  onUseAuto={() => setLineForm(f => ({ ...f, [p]: { ...f[p], hours: '', overtime_hours: '' } }))} ratesHint={ratesHint(p)} />
              );
            })}
            <div className='grid grid-cols-2 gap-3'>
              <div className='grid gap-1.5'>
                <Label htmlFor='pay-add'>Other additions ($)</Label>
                <Input id='pay-add' type='number' min='0' step='0.01' inputMode='decimal' value={form.additions} onChange={set('additions')} disabled={final} />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='pay-deduct'>Deductions ($)</Label>
                <Input id='pay-deduct' type='number' min='0' step='0.01' inputMode='decimal' value={form.deductions} onChange={set('deductions')} disabled={final} />
              </div>
              <div className='col-span-2 grid gap-1.5'>
                <Label htmlFor='pay-notes'>Notes</Label>
                <Textarea id='pay-notes' rows={3} value={form.notes} onChange={set('notes')} placeholder='Shown on the report' disabled={final} />
              </div>
            </div>

            <div className='flex flex-col gap-1.5 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground'>
              {Number(row.refunded) > 0 && <span>Sales include {money(row.refunded)} that was refunded later (counted, as Infloww does).</span>}
              {short.length > 0 && (
                <span className='text-warn'>
                  Counted as full shifts but short on chatting: {short.map(s => `${fmtDay(s.date)} ${s.shift} (${Math.floor(s.active_min / 60)}h ${s.active_min % 60}m)`).join(', ')}.
                </span>
              )}
              {cut.length > 0 && (
                <span className='text-warn'>
                  Cut short, counted from the first to the last message: {cut.map(s => `${fmtDay(s.date)} ${s.shift} ${hoursText(s.hours)} h (${s.first}–${s.last})`).join(', ')}.
                </span>
              )}
              {flags.includes('no_infloww_account') && <span className='text-bad'>No Infloww account is linked to this chatter, so their sales can't be counted.</span>}
              <span>{others.length ? 'OnlyFans sales' : 'Sales'}: {row.details?.sales_source === 'copy' ? 'the last synced copy of Infloww' : 'read from Infloww'}{row.calculated_at ? `, ${stamp(row.calculated_at)}` : ''}.</span>
              {others.map(p => {
                const l = row.lines[p], name = platformInfo(p).name;
                const twice = (l.shifts || []).reduce((sum, x) => sum + (x.paid_on_onlyfans || 0), 0);
                return (
                  <Fragment key={p}>
                    <span>{name} sales: {money(l.sales_gross)}, {money(l.sales_net)} after {name}&apos;s cut. Each goes to whoever was on that page&apos;s shift when the PPV was sent (a tip: when it came in), split if several were on.</span>
                    {Number(l.refunded) > 0 && <span>{name}: {money(l.refunded)} refunded in this period, not taken off (the same as OnlyFans).</span>}
                    {twice > 0 && <span>{name}: {hoursText(twice)} h on the roster was already paid on OnlyFans (the same hours), so it&apos;s left out.</span>}
                  </Fragment>
                );
              })}
            </div>

            {!final && (
              <Button onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</Button>
            )}
          </div>
        </div>

        <DialogFooter className='flex-wrap gap-2 sm:justify-between'>
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' onClick={withCanvas(async (c, r) => saveBlob(await canvasBlob(c), fileName(r, period, 'png')))} disabled={saving}><ImageDown />Download picture</Button>
            <Button variant='outline' onClick={withCanvas(async (c, r) => saveBlob(await pdfFromCanvases([c]), fileName(r, period, 'pdf')))} disabled={saving}><FileDown />Download PDF</Button>
            <Button variant='outline' onClick={withCanvas(async (c) => { await copyCanvas(c); toast.success('Picture copied: paste it into the chat'); })} disabled={saving}><Copy />Copy picture</Button>
          </div>
          {final
            ? <Button variant='ghost' onClick={() => setStatus(false)} disabled={saving}><LockOpen />Back to draft</Button>
            : <Button onClick={() => setStatus(true)} disabled={saving}><Lock />Mark final</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RATE_FIELDS = ['hourly_rate', 'overtime_rate', 'commission_pct'];
const str = (v) => (v === null || v === undefined ? '' : String(v));
const PAY_PLATFORMS = ['onlyfans', 'fanvue'];          // the platforms payroll counts

// Everyone's pay in one place, per platform: the team's rates (for anyone without
// their own) and each active chatter's own. Draft reports take changes straight away.
function PayRatesDialog({ used, onClose, onSaved }) {
  const { platform: shown, counts } = usePlatform();
  const choices = PAY_PLATFORMS.filter(p => p === 'onlyfans' || counts[p] > 0 || used.includes(p));
  const [platform, setPlatform] = useState(choices.includes(shown) ? shown : 'onlyfans');
  const [d, setD] = useState(null);                   // { platform, ready, team, general (not OnlyFans), overtime, chatters }
  const [team, setTeam] = useState({});
  const [own, setOwn] = useState({});                 // chatter id -> rates as typed
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true;
    api.get(`/api/payroll/rates?platform=${platform}`).then(({ data }) => {
      if (!live) return;
      setD(data);
      setTeam(Object.fromEntries(RATE_FIELDS.map(k => [k, str(data.team[k])])));
      setOwn(Object.fromEntries(data.chatters.map(c => [c.id, Object.fromEntries(RATE_FIELDS.map(k => [k, str(c[k])]))])));
    }).catch(e => { if (live) setD({ error: errMsg(e, 'Could not load the pay rates') }); });
    return () => { live = false; };
  }, [platform]);
  const setT = (k) => (e) => setTeam(t => ({ ...t, [k]: e.target.value }));
  const setC = (id, k) => (e) => setOwn(o => ({ ...o, [id]: { ...o[id], [k]: e.target.value } }));
  const fields = d?.overtime ? RATE_FIELDS : RATE_FIELDS.filter(k => k !== 'overtime_rate');
  const other = platform !== 'onlyfans';
  const name = platformInfo(platform).name;
  const dirty = !!d && !d.error && (fields.some(k => team[k] !== str(d.team[k])) || d.chatters.some(c => fields.some(k => own[c.id]?.[k] !== str(c[k]))));
  const pick = (p) => {
    if (p === platform || (dirty && !window.confirm(`Leave without saving the ${name} rates?`))) return;
    setPlatform(p);
    setD(null);
  };
  // what an empty box means: on another platform an empty team rate is the OnlyFans team's
  const general = (k) => (other && d?.general?.[k] != null ? str(d.general[k]) : '');
  const teamOr = (k) => team[k] || general(k);

  const save = async () => {
    if (!other && (team.hourly_rate === '' || team.commission_pct === '')) { toast.error('Fill in the team\'s hourly rate and commission'); return; }
    setSaving(true);
    try {
      const val = (v) => (v === '' ? null : v);
      const changed = d.chatters.filter(c => fields.some(k => own[c.id][k] !== str(c[k])));
      await api.put('/api/payroll/rates', {
        platform,
        team: Object.fromEntries(fields.map(k => [k, val(team[k])])),
        chatters: changed.map(c => ({ id: c.id, ...Object.fromEntries(fields.map(k => [k, val(own[c.id][k])])) })),
      });
      toast.success('Pay rates saved');
      onSaved();
    } catch (e) { toast.error(errMsg(e, 'Could not save')); }
    finally { setSaving(false); }
  };

  const otHint = teamOr('overtime_rate') || 'Same as hourly';
  const locked = other && d && !d.ready;               // before migration 035: team rates only
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Pay rates</DialogTitle>
          <DialogDescription>
            {other
              ? <>Each chatter&apos;s {name} hourly rate, overtime rate and commission (% of {name}&apos;s net, after its cut). Empty uses the team&apos;s.</>
              : <>Each chatter&apos;s{choices.length > 1 ? ' OnlyFans' : ''} hourly rate, overtime rate and commission (% of net sales). Empty uses the team&apos;s.</>}
            {' '}Draft reports take changes straight away; final reports keep the rates they were made with.
          </DialogDescription>
        </DialogHeader>
        {choices.length > 1 && (
          <Tabs value={platform} onValueChange={pick} activationMode='manual'>
            <TabsList>
              {choices.map(p => <TabsTrigger key={p} value={p} className='gap-1.5'><PlatformBadge platform={p} />{platformInfo(p).name}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        )}
        {!d ? (
          <div className='grid gap-2'>{[0, 1, 2].map(i => <Skeleton key={i} className='h-9 w-full' />)}</div>
        ) : d.error ? (
          <p className='text-sm text-muted-foreground'>{d.error}</p>
        ) : (
          <div className='grid gap-4'>
            <div className='grid gap-2 rounded-md border bg-muted/30 p-3'>
              <span className='text-sm font-medium'>Team</span>
              <div className='grid grid-cols-3 gap-2'>
                <div className='grid gap-1'>
                  <Label htmlFor='team-rate' className='text-xs'>Hourly rate ($)</Label>
                  <Input id='team-rate' type='number' min='0' step='0.25' inputMode='decimal' value={team.hourly_rate} onChange={setT('hourly_rate')} placeholder={general('hourly_rate')} />
                </div>
                <div className='grid gap-1'>
                  <Label htmlFor='team-ot' className='text-xs'>Overtime rate ($)</Label>
                  <Input id='team-ot' type='number' min='0' step='0.25' inputMode='decimal' value={team.overtime_rate ?? ''} onChange={setT('overtime_rate')} placeholder={general('overtime_rate') || 'Same as hourly'} disabled={!d.overtime} />
                </div>
                <div className='grid gap-1'>
                  <Label htmlFor='team-commission' className='text-xs'>Commission (%)</Label>
                  <Input id='team-commission' type='number' min='0' max='100' step='0.5' inputMode='decimal' value={team.commission_pct} onChange={setT('commission_pct')} placeholder={general('commission_pct')} />
                </div>
              </div>
              {!d.overtime && <p className='text-xs text-warn'>Run migration 029 in Supabase to set overtime rates.</p>}
              {other && <p className='text-xs text-muted-foreground'>Empty uses the OnlyFans team&apos;s rate (shown greyed out).</p>}
              {locked && <p className='text-xs text-warn'>Run database change 035 in Supabase to give chatters their own {name} rates. Until then the team&apos;s apply to everyone.</p>}
            </div>
            <div className='overflow-x-auto rounded-md border'>
              <table className='w-full min-w-[480px] text-sm'>
                <thead>
                  <tr className='border-b bg-muted/40 text-left text-xs text-muted-foreground'>
                    <th className='px-3 py-2 font-medium'>Chatter</th>
                    <th className='px-2 py-2 font-medium'>Hourly rate ($)</th>
                    <th className='px-2 py-2 font-medium'>Overtime rate ($)</th>
                    <th className='px-2 py-2 font-medium'>Commission (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {d.chatters.map(c => (
                    <tr key={c.id} className='border-b last:border-b-0'>
                      <td className='px-3 py-1.5 font-medium'>{c.name}</td>
                      <td className='px-2 py-1.5'><Input aria-label={`${c.name}: ${other ? `${name} ` : ''}hourly rate`} type='number' min='0' step='0.25' inputMode='decimal' className='h-8' value={own[c.id]?.hourly_rate ?? ''} onChange={setC(c.id, 'hourly_rate')} placeholder={teamOr('hourly_rate')} disabled={locked} /></td>
                      <td className='px-2 py-1.5'><Input aria-label={`${c.name}: ${other ? `${name} ` : ''}overtime rate`} type='number' min='0' step='0.25' inputMode='decimal' className='h-8' value={own[c.id]?.overtime_rate ?? ''} onChange={setC(c.id, 'overtime_rate')} placeholder={otHint} disabled={!d.overtime || locked} /></td>
                      <td className='px-2 py-1.5'><Input aria-label={`${c.name}: ${other ? `${name} ` : ''}commission`} type='number' min='0' max='100' step='0.5' inputMode='decimal' className='h-8' value={own[c.id]?.commission_pct ?? ''} onChange={setC(c.id, 'commission_pct')} placeholder={teamOr('commission_pct')} disabled={locked} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!d || !!d.error || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
