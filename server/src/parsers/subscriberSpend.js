const XLSX = require('xlsx');
const crypto = require('crypto');
const { supabaseAdmin } = require('../utils/supabase');

/**
 * Import subscriber SPEND ONLY from a (filtered) message-dashboard export.
 *
 * The sales export is a normal message dashboard pre-filtered to rows where
 * price > $1 AND Purchased = yes. This importer:
 *   - reads username + nickname + price + caption + date per sale row,
 *   - records each distinct sale in `subscriber_sales` (dedup key:
 *     org + username + date + price + message_hash), so accumulating multiple
 *     date-range files is idempotent (re-uploads / overlaps don't double-count),
 *   - recomputes each affected subscriber's total_spend from the ledger.
 *
 * It deliberately does NOT create chatters or store messages — so uploading
 * historical files can't pollute the team roster with ex-employees.
 */
async function importSubscriberSpend(fileBuffer, fileName, orgId) {
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  if (!rows.length) throw new Error('Spreadsheet is empty');

  const headers = Object.keys(rows[0]).map(h => h.toLowerCase());
  if (!headers.some(h => h.includes('sent to')) || !headers.some(h => h.includes('price'))) {
    throw new Error('Wrong file type — expected a message dashboard export (needs "Sent to" and "Price" columns)');
  }

  const num = v => parseFloat(String(v == null ? '' : v).replace(/[$,]/g, '')) || 0;
  const parseDate = v => {
    // Infloww "Sent date" like "May 21, 2026" -> 2026-05-21
    const M = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const m = String(v || '').match(/(\w{3})\s+(\d+),\s+(\d+)/);
    if (!m) return null;
    return `${m[3]}-${M[m[1]]}-${String(m[2]).padStart(2, '0')}`;
  };
  const hash = s => crypto.createHash('sha1').update(String(s || '')).digest('hex').slice(0, 12);

  // Build sale records (only genuine PPV purchases).
  const sales = [];
  const affected = new Set();
  for (const r of rows) {
    const purchased = String(r['Purchased'] ?? r['purchased'] ?? '').toLowerCase() === 'yes';
    const price = num(r['Price'] ?? r['price']);
    if (!purchased || price <= 1) continue;                 // price > $1 AND bought

    const sentTo = r['Sent to'] ?? r['Sent To'] ?? '';
    // "Nickname (username)" -> split
    const um = String(sentTo).match(/\(([^)]+)\)/);
    const username = um ? um[1] : String(sentTo).trim();
    const nickname = String(sentTo).split('(')[0].trim() || username;
    if (!username) continue;

    const saleDate = parseDate(r['Sent date'] ?? r['Sent Date']);
    const caption = String(r['Creator Message'] ?? r['creator message'] ?? '').replace(/<[^>]+>/g, '').trim();

    sales.push({
      organisation_id: orgId,
      username, display_name: nickname,
      sale_date: saleDate, price: Math.round(price * 100) / 100,
      message_hash: hash(caption),
      creator_name: (r['Creator'] || '').trim() || null,
    });
    affected.add(username);
  }

  if (!sales.length) {
    return { salesFound: 0, newSales: 0, subscribersUpdated: 0 };
  }

  // Insert with upsert on the dedup key — duplicates are ignored, not added.
  let inserted = 0;
  const BATCH = 500;
  for (let i = 0; i < sales.length; i += BATCH) {
    const batch = sales.slice(i, i + BATCH);
    const { error, count } = await supabaseAdmin
      .from('subscriber_sales')
      .upsert(batch, { onConflict: 'organisation_id,username,sale_date,price,message_hash', ignoreDuplicates: true, count: 'exact' });
    if (error) { console.error('[SpendImport] insert error:', error.message); throw error; }
    inserted += count || 0;
  }

  // Recompute totals for affected subscribers from the ledger.
  const updated = await recomputeSubscribersFromLedger(orgId, [...affected]);

  console.log(`[SpendImport] ${sales.length} sales in file, ${inserted} new, ${updated} subscribers updated`);
  return { salesFound: sales.length, newSales: inserted, subscribersUpdated: updated };
}

/**
 * Recompute total_spend (and classification) for the given usernames from the
 * subscriber_sales ledger. Spend = sum of all that fan's distinct PPV sales.
 */
async function recomputeSubscribersFromLedger(orgId, usernames) {
  const classify = total => total >= 1000 ? 'whale' : total >= 100 ? 'ps' : total > 0 ? 'regular' : 'unclassified';
  let updated = 0;

  for (const username of usernames) {
    // pull this fan's sales
    const { data: rows } = await supabaseAdmin
      .from('subscriber_sales')
      .select('price, sale_date, display_name')
      .eq('organisation_id', orgId)
      .eq('username', username);
    if (!rows?.length) continue;

    const total = Math.round(rows.reduce((s, r) => s + (parseFloat(r.price) || 0), 0) * 100) / 100;
    const dates = rows.map(r => r.sale_date).filter(Boolean).sort();
    const display = rows.map(r => r.display_name).filter(Boolean).pop();

    const payload = {
      total_spend: total,
      classification: classify(total),
      display_name: display,
      first_seen: dates[0] || null,
      last_spend_date: dates[dates.length - 1] || null,
    };

    const { data: existing } = await supabaseAdmin
      .from('subscribers').select('id').eq('organisation_id', orgId).eq('username', username).maybeSingle();
    if (existing) {
      await supabaseAdmin.from('subscribers').update(payload).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('subscribers').insert({ username, organisation_id: orgId, ...payload });
    }
    updated++;
  }
  return updated;
}

/**
 * Feed sales from already-stored MESSAGES into the shared ledger.
 *
 * Called after a normal daily message-dashboard upload. Reads PPV sales
 * (purchased, price>1) from the messages table and inserts any not already in
 * the ledger (deduped by fan+date+price+message), then recomputes affected
 * subscribers. This keeps spend current automatically while never overwriting
 * the bulk history imported via importSubscriberSpend().
 */
async function addDashboardSalesToLedger(orgId) {
  const crypto = require('crypto');
  const hash = s => crypto.createHash('sha1').update(String(s || '')).digest('hex').slice(0, 12);

  // pull PPV sales from messages
  const sales = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('sent_to_username, sent_to_nickname, price, sent_date, creator_message_text, creator_id')
      .eq('organisation_id', orgId)
      .eq('purchased', true)
      .gt('price', 1)
      .range(offset, offset + 999);
    if (error || !data?.length) break;
    sales.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  if (!sales.length) return { newSales: 0, subscribersUpdated: 0 };

  const affected = new Set();
  const records = sales.map(s => {
    const u = s.sent_to_username || (s.sent_to_nickname || '').trim();
    if (u) affected.add(u);
    const caption = String(s.creator_message_text || '').replace(/<[^>]+>/g, '').trim();
    return {
      organisation_id: orgId,
      username: u,
      display_name: s.sent_to_nickname || u,
      sale_date: s.sent_date,
      price: Math.round((parseFloat(s.price) || 0) * 100) / 100,
      message_hash: hash(caption),
      creator_name: null,
    };
  }).filter(r => r.username);

  let inserted = 0;
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error, count } = await supabaseAdmin
      .from('subscriber_sales')
      .upsert(batch, { onConflict: 'organisation_id,username,sale_date,price,message_hash', ignoreDuplicates: true, count: 'exact' });
    if (error) { console.error('[Ledger] insert error:', error.message); break; }
    inserted += count || 0;
  }

  const updated = await recomputeSubscribersFromLedger(orgId, [...affected]);
  console.log(`[Ledger] daily dashboard: ${records.length} sales seen, ${inserted} new, ${updated} subscribers updated`);
  return { newSales: inserted, subscribersUpdated: updated };
}

module.exports = { importSubscriberSpend, recomputeSubscribersFromLedger, addDashboardSalesToLedger };
