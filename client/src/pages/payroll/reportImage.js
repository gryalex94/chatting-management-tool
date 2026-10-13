// The payroll report as a picture (canvas) and as a PDF, drawn here so what the
// manager previews is exactly what the chatter gets. Same look as the reports sent
// before: a black table, labels in bold italic, then sales per page and the shifts.

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const W = 640;                       // CSS pixels; drawn at `scale` × for sharp text
const PAD = 20;
const C = { bg: '#000000', text: '#ffffff', grid: '#3a3a3a', muted: '#a8a8a8', soft: '#d6d6d6', line: '#2c2c2c', foot: '#8a8a8a' };
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const d0 = (iso) => new Date(`${iso}T12:00:00Z`);
export const fmtDay = (iso) => { const d = d0(iso); return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const short = (iso) => { const d = d0(iso); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const periodTitle = (p) => `${short(p.start)} – ${short(p.end)} ${d0(p.end).getUTCFullYear()}`;
export const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const hoursText = (h) => String(Math.round((Number(h) || 0) * 100) / 100);
const pct = (n) => String(Math.round((Number(n) || 0) * 100) / 100);

// Lines of `text` that fit in `width` at the current font.
function wrap(ctx, text, width) {
  const out = [];
  for (const para of String(text || '').split(/\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

// Lays the report out top to bottom; draws only when `draw` (the first pass measures).
function paint(ctx, r, period, draw) {
  const inner = W - 2 * PAD, labelW = Math.round(inner * 0.46), valueX = PAD + labelW, valueW = inner - labelW;
  const text = (s, x, y, font, color, align = 'left') => {
    ctx.font = `${font} ${FONT}`;
    if (!draw) return ctx.measureText(s).width;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
    return ctx.measureText(s).width;
  };
  const line = (x1, y1, x2, y2, color) => {
    if (!draw) return;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  let y = PAD;

  // title
  text('Payroll report', PAD, y + 18, '500 18px', C.text);
  text(periodTitle(period), W - PAD, y + 17, '13px', C.muted, 'right');
  y += 32;

  // the main table
  const shiftsCount = (r.details?.shifts || []).length;
  ctx.font = `14px ${FONT}`;
  const notes = r.notes ? wrap(ctx, r.notes, valueW - 24) : [];
  const rows = [
    { label: 'Name:', value: r.chatter_name, strong: true },
    { label: 'Period:', value: `${fmtDay(period.start)} 00:00 – ${fmtDay(period.end)} 23:59`, sub: 'CET (Amsterdam time)' },
    { label: 'Sales brutto:', value: money(r.sales_gross) },
    { label: `Sales netto (${pct(100 - r.of_cut_pct)}%):`, value: money(r.sales_net) },
    { label: `Commission (${pct(r.commission_pct)}%):`, value: money(r.commission) },
    { label: 'Hours worked:', value: hoursText(r.hours_paid), extra: shiftsCount ? `(${shiftsCount} shift${shiftsCount === 1 ? '' : 's'})` : '' },
    { label: 'Hourly pay:', value: money(r.hourly_pay), extra: `(${hoursText(r.hours_paid)} h × ${money(r.hourly_rate)})` },
    { label: 'Other additions:', value: money(r.additions) },
    { label: 'Deductions:', value: money(r.deductions) },
    { label: 'Notes:', notes, minH: 48 },
    { label: 'In total:', value: money(r.total), strong: true, big: true },
  ];
  const top = y;
  for (const row of rows) {
    const h = row.notes ? Math.max(row.minH, 16 + row.notes.length * 19) : row.sub ? 52 : 36;
    const base = y + 23;
    text(row.label, PAD + 12, base, `italic 500 ${row.big ? 16 : 15}px`, C.text);
    if (row.notes) row.notes.forEach((l, i) => text(l, valueX + 12, base + i * 19, '14px', C.soft));
    else {
      const w = text(row.value, valueX + 12, base, `${row.strong ? '500 ' : ''}${row.big ? 16 : 15}px`, C.text);
      if (row.extra) text(row.extra, valueX + 12 + w + 6, base, '12px', C.muted);
      if (row.sub) text(row.sub, valueX + 12, base + 18, '12px', C.muted);
    }
    line(PAD, y + h, W - PAD, y + h, C.grid);
    y += h;
  }
  // table borders
  line(PAD, top, W - PAD, top, C.grid);
  line(PAD, top, PAD, y, C.grid);
  line(valueX, top, valueX, y, C.grid);
  line(W - PAD, top, W - PAD, y, C.grid);

  // sales per page, two to a row
  const pages = r.details?.pages || [];
  if (pages.length) {
    y += 26;
    text('Sales per page', PAD, y, '13px', C.muted);
    y += 8;
    const colW = inner / 2;
    for (let i = 0; i < pages.length; i += 2) {
      for (const [k, p] of [pages[i], pages[i + 1]].entries()) {
        if (!p) continue;
        const x = PAD + k * colW;
        text(p.name, x + 10, y + 19, '13px', C.soft);
        text(money(p.amount), x + colW - 12, y + 19, '13px', C.soft, 'right');
      }
      line(PAD, y + 27, W - PAD, y + 27, C.line);
      y += 27;
    }
  }

  // the shifts worked
  const shifts = r.details?.shifts || [];
  if (shifts.length) {
    y += 26;
    text('Shifts worked', PAD, y, '13px', C.muted);
    y += 8;
    for (const s of shifts) {
      const what = s.whole ? `${s.shift} ${s.from}–${s.to}` : `${s.shift} overtime, ${s.first}–${s.last}`;
      text(fmtDay(s.date), PAD + 10, y + 19, '13px', C.soft);
      text(what, PAD + 130, y + 19, '13px', C.soft);
      text(`${hoursText(s.hours)} h`, W - PAD - 10, y + 19, '13px', C.soft, 'right');
      line(PAD, y + 27, W - PAD, y + 27, C.line);
      y += 27;
    }
  }

  // where the numbers come from
  y += 22;
  ctx.font = `11px ${FONT}`;
  const made = new Date(r.finalized_at || r.calculated_at || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const foot = wrap(ctx, `Sales as Infloww shows them (Amsterdam time), refunds included. Hours: the shifts that started in this period. Made ${fmtDay(made)} ${made.slice(0, 4)}.`, inner);
  foot.forEach((l, i) => text(l, PAD, y + i * 15, '11px', C.foot));
  y += (foot.length - 1) * 15 + PAD;
  return Math.ceil(y);
}

/** The report drawn on a new canvas (scale × pixels for sharp text). */
export function drawReport(r, period, { scale = 2 } = {}) {
  const measure = document.createElement('canvas').getContext('2d');
  const h = paint(measure, r, period, false);
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, h);
  paint(ctx, r, period, true);
  return canvas;
}

export const canvasBlob = (canvas) => new Promise((resolve, reject) =>
  canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not make the image'))), 'image/png'));

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Puts the picture on the clipboard, to paste straight into a chat. */
export async function copyCanvas(canvas) {
  if (!navigator.clipboard?.write || typeof window.ClipboardItem === 'undefined') {
    throw new Error('This browser can\'t copy pictures. Download it instead.');
  }
  await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': canvasBlob(canvas) })]);
}

// ── PDF: each report a page, the picture filling it ─────────────────────────
// Lossless (deflated pixels) where the browser can compress, else a sharp JPEG.
async function pageImage(canvas) {
  const { width, height } = canvas;
  if (typeof CompressionStream !== 'undefined') {
    const px = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < px.length; i += 4) { rgb[j++] = px[i]; rgb[j++] = px[i + 1]; rgb[j++] = px[i + 2]; }
    const stream = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
    return { width, height, filter: 'FlateDecode', bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
  }
  const b64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  return { width, height, filter: 'DCTDecode', bytes: Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)) };
}

/** A PDF with one page per canvas, each page the picture's shape at A4 width. */
export async function pdfFromCanvases(canvases) {
  const enc = new TextEncoder();
  const parts = [], offsets = [];
  let length = 0;
  const push = (data) => { const b = typeof data === 'string' ? enc.encode(data) : data; parts.push(b); length += b.length; };
  const obj = (n, write) => { offsets[n] = length; push(`${n} 0 obj\n`); write(); push('\nendobj\n'); };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));           // marks the file as binary
  const n = canvases.length;
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${canvases.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${n} >>`));
  for (let i = 0; i < n; i++) {
    const img = await pageImage(canvases[i]);
    const pw = 595.28, ph = Math.round(pw * img.height / img.width * 100) / 100;
    const page = 3 + 3 * i, content = page + 1, image = page + 2;
    obj(page, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im${i} ${image} 0 R >> >> /Contents ${content} 0 R >>`));
    const draw = `q ${pw} 0 0 ${ph} 0 0 cm /Im${i} Do Q`;
    obj(content, () => { push(`<< /Length ${draw.length} >>\nstream\n`); push(draw); push('\nendstream'); });
    obj(image, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${img.filter} /Length ${img.bytes.length} >>\nstream\n`);
      push(img.bytes);
      push('\nendstream');
    });
  }
  const size = 3 + 3 * n;
  const xref = length;
  push(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let k = 1; k < size; k++) push(`${String(offsets[k]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
