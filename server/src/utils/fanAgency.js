/**
 * One fan across the whole agency: where he sits and what he spent on each page.
 *
 *  - Fansly: exact. Fansly gives a fan one account id across every creator, so the
 *    same id on two of our Fansly pages is the same person.
 *  - OnlyFans (Infloww sales) and Fanvue (earnings): no shared id. A link is either
 *    made by hand in the side panel (fan_links), or suggested when his Fansly
 *    username is exactly a known OnlyFans username or Fanvue handle. A suggested
 *    match says so; usernames are often different, so most links are by hand.
 *
 * Amounts are net (after the platform's cut), refunds taken off.
 */
const { supabaseAdmin } = require('./supabase');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// usernames often hold "_", a wildcard in a LIKE pattern: match it literally
const esc = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);
const latest = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

async function pageNames(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const { data } = await supabaseAdmin.from('creators').select('id, name').in('id', list);
  return new Map((data || []).map(c => [c.id, c.name]));
}

/** His rows on every Fansly page of the organisation. */
async function fanslyPages(orgId, fanId, thisAccountId) {
  const { data: accounts } = await supabaseAdmin.from('fansly_accounts').select('id, username, creator_id').eq('organisation_id', orgId);
  const ids = (accounts || []).map(a => a.id);
  if (!ids.length) return [];
  const [{ data: fans }, { data: tx }] = await Promise.all([
    supabaseAdmin.from('fansly_fans').select('account_id, subscription_tier_name, subscribed_until, last_message_at, follows_you').eq('fansly_account_id', fanId).in('account_id', ids),
    supabaseAdmin.from('fansly_transactions').select('account_id, category, net, created_at_fansly').eq('fan_account_id', fanId).in('account_id', ids).limit(5000),
  ]);
  const names = await pageNames((accounts || []).map(a => a.creator_id));
  const out = new Map();
  const row = (accId) => {
    if (!out.has(accId)) {
      const a = (accounts || []).find(x => x.id === accId) || {};
      out.set(accId, { platform: 'fansly', page: names.get(a.creator_id) || a.username || 'Fansly page', this_page: accId === thisAccountId, spent_net: 0, purchases: 0, last_purchase_at: null, tier: null, subscribed_until: null, last_message_at: null, match: 'same_account' });
    }
    return out.get(accId);
  };
  for (const f of fans || []) Object.assign(row(f.account_id), { tier: f.subscription_tier_name, subscribed_until: f.subscribed_until, last_message_at: f.last_message_at });
  for (const t of tx || []) {
    const x = row(t.account_id);
    const net = Math.abs(Number(t.net) || 0);
    if (t.category === 'refund') x.spent_net -= net; else { x.spent_net += net; x.purchases += 1; x.last_purchase_at = latest(x.last_purchase_at, t.created_at_fansly); }
  }
  return [...out.values()].map(x => ({ ...x, spent_net: r2(x.spent_net) }));
}

/** OnlyFans spending of one Infloww fan id, per page. */
async function onlyfansPages(orgId, ofId) {
  const { data } = await supabaseAdmin.from('infloww_sales').select('creator_id, net, created_at, status, type').eq('organisation_id', orgId).eq('fan_id', String(ofId)).neq('status', 'undo').limit(5000);
  const names = await pageNames((data || []).map(s => s.creator_id));
  const by = new Map();
  for (const s of data || []) {
    const x = by.get(s.creator_id) || { platform: 'onlyfans', page: names.get(s.creator_id) || 'OnlyFans page', spent_net: 0, purchases: 0, last_purchase_at: null };
    x.spent_net += Number(s.net) || 0;
    if (!/subscription/i.test(s.type || '')) x.purchases += 1;
    x.last_purchase_at = latest(x.last_purchase_at, s.created_at);
    by.set(s.creator_id, x);
  }
  return [...by.values()].map(x => ({ ...x, spent_net: r2(x.spent_net) }));
}

/** Fanvue spending of one fan uuid, per page. */
async function fanvuePages(orgId, fanUuid) {
  const { data: accounts } = await supabaseAdmin.from('fanvue_accounts').select('id, handle, creator_id').eq('organisation_id', orgId);
  const ids = (accounts || []).map(a => a.id);
  if (!ids.length) return [];
  const { data } = await supabaseAdmin.from('fanvue_earnings').select('account_id, source, net_cents, paid_at').eq('fan_uuid', fanUuid).in('account_id', ids).limit(5000);
  const names = await pageNames((accounts || []).map(a => a.creator_id));
  const by = new Map();
  for (const e of data || []) {
    const a = (accounts || []).find(x => x.id === e.account_id) || {};
    const x = by.get(e.account_id) || { platform: 'fanvue', page: names.get(a.creator_id) || a.handle || 'Fanvue page', spent_net: 0, purchases: 0, last_purchase_at: null };
    const net = Math.abs(Number(e.net_cents) || 0) / 100;
    if (e.source === 'refund' || e.source === 'chargeback') x.spent_net -= net;
    else { x.spent_net += net; if (e.source !== 'subscription' && e.source !== 'renewal') x.purchases += 1; x.last_purchase_at = latest(x.last_purchase_at, e.paid_at); }
    by.set(e.account_id, x);
  }
  return [...by.values()].map(x => ({ ...x, spent_net: r2(x.spent_net) }));
}

/**
 * Everything about one Fansly fan across the agency: his Fansly pages (exact),
 * the OnlyFans and Fanvue accounts linked to him (by hand or by the same username),
 * and the total.
 */
async function agencySpend(orgId, fanId, { username = null, thisAccountId = null } = {}) {
  const fansly = await fanslyPages(orgId, fanId, thisAccountId);
  const { data: links } = await supabaseAdmin.from('fan_links').select('id, platform, ref_id, ref_name').eq('organisation_id', orgId).eq('fansly_fan_id', fanId);
  const linked = (links || []).map(l => ({ ...l, match: 'linked' }));
  // the same username elsewhere: a suggestion, unless already linked
  const u = String(username || '').trim().toLowerCase();
  if (u) {
    const [{ data: ofs }, { data: fvs }] = await Promise.all([
      supabaseAdmin.from('fan_infloww_ids').select('of_user_id, username').eq('organisation_id', orgId).ilike('username', esc(u)).limit(3),
      (async () => {
        const { data: acc } = await supabaseAdmin.from('fanvue_accounts').select('id').eq('organisation_id', orgId);
        const ids = (acc || []).map(a => a.id);
        return ids.length ? supabaseAdmin.from('fanvue_fans').select('fan_uuid, handle').in('account_id', ids).ilike('handle', esc(u)).limit(3) : { data: [] };
      })(),
    ]);
    // a fan has one account per platform: a suggestion only where nothing is linked yet, and only the first
    const o = (ofs || [])[0], f = (fvs || [])[0];
    if (o && !linked.some(l => l.platform === 'onlyfans')) linked.push({ id: null, platform: 'onlyfans', ref_id: String(o.of_user_id), ref_name: o.username, match: 'username' });
    if (f && !linked.some(l => l.platform === 'fanvue')) linked.push({ id: null, platform: 'fanvue', ref_id: f.fan_uuid, ref_name: f.handle, match: 'username' });
  }
  const other = [];
  for (const l of linked) {
    const pages = l.platform === 'onlyfans' ? await onlyfansPages(orgId, l.ref_id) : await fanvuePages(orgId, l.ref_id);
    const base = { link_id: l.id, ref_id: l.ref_id, ref_name: l.ref_name, match: l.match };
    if (!pages.length) other.push({ ...base, platform: l.platform, page: null, spent_net: 0, purchases: 0, last_purchase_at: null });
    for (const p of pages) other.push({ ...p, ...base });
  }
  const all = [...fansly, ...other];
  // the same view per platform: his one account there, its total, and its pages
  const byPlatform = ['fansly', 'onlyfans', 'fanvue'].map(pl => {
    const pages = all.filter(p => p.platform === pl);
    if (!pages.length) return null;
    const link = pages.find(p => p.match !== 'same_account') || null;
    return { platform: pl, account: link ? { ref_id: link.ref_id, name: link.ref_name, match: link.match, link_id: link.link_id } : null,
      spent_net: r2(pages.reduce((n, p) => n + (p.spent_net || 0), 0)), purchases: pages.reduce((n, p) => n + (p.purchases || 0), 0), pages: pages.filter(p => p.page) };
  }).filter(Boolean);
  return {
    platforms_detail: byPlatform,
    pages: all,
    total_net: r2(all.reduce((n, p) => n + (p.spent_net || 0), 0)),
    fansly_pages: fansly.length,
    platforms: [...new Set(all.filter(p => p.spent_net > 0 || p.platform === 'fansly').map(p => p.platform))],
  };
}

/** Find a fan on OnlyFans or Fanvue to link: by username, handle or name. */
async function searchOther(orgId, q) {
  const raw = String(q || '').trim().replace(/[,()]/g, '').slice(0, 60);
  const term = esc(raw);
  if (raw.length < 2) return [];
  const out = [];
  const { data: ofs } = await supabaseAdmin.from('fan_infloww_ids').select('of_user_id, username').eq('organisation_id', orgId).ilike('username', `%${term}%`).limit(10);
  for (const o of ofs || []) out.push({ platform: 'onlyfans', ref_id: String(o.of_user_id), name: o.username });
  const { data: named } = await supabaseAdmin.from('infloww_sales').select('fan_id, fan_name').eq('organisation_id', orgId).ilike('fan_name', `%${term}%`).limit(30);
  for (const s of named || []) if (s.fan_id && !out.some(x => x.platform === 'onlyfans' && x.ref_id === String(s.fan_id))) out.push({ platform: 'onlyfans', ref_id: String(s.fan_id), name: s.fan_name });
  const { data: acc } = await supabaseAdmin.from('fanvue_accounts').select('id').eq('organisation_id', orgId);
  const ids = (acc || []).map(a => a.id);
  if (ids.length) {
    const { data: fvs } = await supabaseAdmin.from('fanvue_fans').select('fan_uuid, handle, display_name').in('account_id', ids).or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`).limit(10);
    for (const f of fvs || []) if (!out.some(x => x.platform === 'fanvue' && x.ref_id === f.fan_uuid)) out.push({ platform: 'fanvue', ref_id: f.fan_uuid, name: f.handle || f.display_name });
  }
  return out.slice(0, 20);
}

module.exports = { agencySpend, searchOther };
