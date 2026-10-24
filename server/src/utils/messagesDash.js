/**
 * The Messages dashboard for OnlyFans and Fanvue: the same rows and totals as Fansly's
 * (routes/fansly.js /messages), so one page shows every platform.
 *  - OnlyFans: the uploaded chat exports (messages). Their times are Infloww's own clock
 *    (see ai/evalShared.js dayWindow); they go out as real instants.
 *  - Fanvue: the copied chats; the sender is whoever was on the Fanvue shift then.
 */
const { supabaseAdmin } = require('./supabase');
const Stats = require('./fanslyStats');
const R = require('./roster');
const { dayWindow } = require('../ai/evalShared');
const OF = require('./ofReports');
const FV = require('./fanvueReports');

const LOCAL_CLOCK_FROM = '2026-08-11';          // the exports' clock: CET before this day, Amsterdam time from it
const amsOffsetMs = (ts) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000;
};
/** An export time (a wall clock stored as UTC) as the real instant. */
function exportInstant(stored) {
  const ts = Date.parse(stored);
  if (!Number.isFinite(ts)) return null;
  const wall = new Date(ts).toISOString();
  return new Date(ts - (wall.slice(0, 10) >= LOCAL_CLOCK_FROM ? amsOffsetMs(ts - amsOffsetMs(ts)) : 3600000)).toISOString();
}
const cents = (n) => Math.round(n * 100) / 100;
/** One page of a list function, or (for a spreadsheet) every row up to 20,000, a thousand at a time. */
async function rows(fn, args, f, csv) {
  if (!csv) return supabaseAdmin.rpc(fn, { ...args, p_limit: f.size, p_offset: (f.page - 1) * f.size });
  const out = [];
  for (let off = 0; off < 20000; off += 1000) {
    const { data, error } = await supabaseAdmin.rpc(fn, { ...args, p_limit: 1000, p_offset: off });
    if (error) return { error };
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: out };
}

function filters(q) {
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const money = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  const to = day(q.to) || Stats.amsDay(new Date()), from = day(q.from) || Stats.addDays(to, -6);
  return {
    from, to, account: /^[0-9a-f-]{36}$/i.test(String(q.account || '')) ? String(q.account) : null,
    chatter: String(q.chatter || '').trim().slice(0, 80) || null, q: String(q.q || '').trim().slice(0, 100) || null,
    fan: String(q.fan || '').trim().slice(0, 80) || null, price_min: money(q.price_min), price_max: money(q.price_max),
    purchased: pick(q.purchased, ['all', 'yes', 'no', 'ppv'], 'all'), status: pick(q.status, ['all', 'sent', 'unsent'], 'all'), replied: pick(q.replied, ['all', 'no'], 'all'),
    size: [25, 50, 100].includes(Number(q.size)) ? Number(q.size) : 50, page: Math.max(1, Math.floor(Number(q.page) || 1)),
  };
}
const totalsOut = (t = {}) => ({ messages: Number(t.messages || 0), fans: Number(t.fans || 0), ppv_sent: Number(t.ppv_sent || 0), ppv_sold: Number(t.ppv_sold || 0),
  sold_net: cents(Number(t.sold_net || 0)), unsent: Number(t.unsent || 0), median_reply_s: t.median_reply_s ?? null });

// ---------------- OnlyFans ----------------
async function ofList(orgId, f, { csv = false } = {}) {
  const pages = await OF.ofPages(orgId);
  const name = new Map(pages.map(p => [p.id, p.page]));
  const { data: all } = await supabaseAdmin.from('creators').select('id, name, infloww_creator_id').eq('organisation_id', orgId).eq('platform', 'onlyfans');
  for (const c of all || []) if (!name.has(c.id)) name.set(c.id, c.name);
  const cid = new Map((all || []).filter(c => c.infloww_creator_id).map(c => [c.id, String(c.infloww_creator_id)]));
  const args = {
    p_org: orgId, p_creators: f.account ? [f.account] : null, p_sender: f.chatter === 'none' ? null : f.chatter,
    p_start: dayWindow(f.from).start, p_end: dayWindow(f.to).end, p_q: f.q, p_fan: f.fan, p_price_min: f.price_min, p_price_max: f.price_max,
    p_purchased: f.purchased, p_status: f.status,
  };
  const [res, tot] = await Promise.all([
    rows('of_sent_messages', args, f, csv),
    csv ? { data: [] } : supabaseAdmin.rpc('of_sent_totals', args),
  ]);
  if (res.error) throw res.error;
  if (tot.error) throw tot.error;
  const t = totalsOut((tot.data || [])[0]);
  // "Open in Infloww": the same link as Infloww's own "Copy chat link" (the page's Infloww id and the fan's
  // OnlyFans id: the number in a default "u<number>" username, or one learned from Infloww's sales)
  const odd = [...new Set((res.data || []).map(m => m.sent_to_username).filter(u => u && !/^u\d+$/.test(u)))];
  const fanId = new Map();
  for (let i = 0; i < odd.length; i += 200) {
    const { data } = await supabaseAdmin.from('fan_infloww_ids').select('username, of_user_id').eq('organisation_id', orgId).in('username', odd.slice(i, i + 200));
    for (const x of data || []) fanId.set(x.username, String(x.of_user_id));
  }
  const link = (m) => {
    const fid = /^u(\d+)$/.exec(m.sent_to_username || '')?.[1] || fanId.get(m.sent_to_username);
    return fid && cid.get(m.creator_id) ? `infloww://open?fid=${fid}&cid=${cid.get(m.creator_id)}&type=chatLink` : null;
  };
  return {
    rows: (res.data || []).map(m => ({
      account_id: m.creator_id, message_id: m.id, group_id: null, fan_account_id: m.sent_to_username, page: name.get(m.creator_id) || 'OnlyFans page',
      chatter: m.sender_name || null, fan_nickname: m.sent_to_nickname || null, fan_username: m.sent_to_username || null, display_name: null,
      prev_fan_text: m.fan_message_text || null, message: m.creator_message_text, sent_at: exportInstant(m.sent_datetime),
      reply_s: m.fan_message_text && m.replay_time_seconds > 0 ? m.replay_time_seconds : null, price: Number(m.price) || 0,
      sold_at: m.purchased ? exportInstant(m.sent_datetime) : null, sold_net: m.purchased ? Number(m.price) : null,
      unsent_at: m.status === 'Unsent' ? exportInstant(m.sent_datetime) : null, chat_url: link(m),
    })),
    page: f.page, size: f.size, total: t.messages, totals: t, my_browsers: [],
  };
}

async function ofFilters(orgId) {
  const accounts = (await OF.ofPages(orgId)).map(p => ({ id: p.id, page: p.page }));
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin.from('chatter_daily_metrics').select('chatter_id').eq('organisation_id', orgId).gte('report_date', since).limit(5000);
  const ids = [...new Set((data || []).map(d => d.chatter_id))];
  const { data: chs } = ids.length ? await supabaseAdmin.from('chatters').select('id, name').in('id', ids).order('name') : { data: [] };
  // the sender filter is the name in the chat exports
  return { accounts, chatters: (chs || []).map(c => ({ id: c.name, name: c.name })), senders_by_name: true };
}

async function ofRecipients(orgId, term) {
  const t = term.replace(/[%_,()]/g, '');
  if (t.length < 2) return [];
  const { data } = await supabaseAdmin.from('messages').select('sent_to_username, sent_to_nickname, creator_id').eq('organisation_id', orgId)
    .or(`sent_to_username.ilike.%${t}%,sent_to_nickname.ilike.%${t}%`).gte('sent_datetime', new Date(Date.now() - 120 * 86400000).toISOString()).limit(200);
  const seen = new Map();
  for (const m of data || []) if (m.sent_to_username && !seen.has(m.sent_to_username)) seen.set(m.sent_to_username, { fan_account_id: m.sent_to_username, account_id: m.creator_id, name: m.sent_to_nickname || m.sent_to_username, username: m.sent_to_username });
  return [...seen.values()].slice(0, 20);
}

async function ofConversation(orgId, creatorId, fan) {
  const { data, error } = await supabaseAdmin.from('messages').select('id, sender_name, fan_message_text, creator_message_text, sent_datetime, price, purchased, status')
    .eq('organisation_id', orgId).eq('creator_id', creatorId).eq('sent_to_username', fan).order('sent_datetime').limit(1000);
  if (error) throw error;
  const { data: c } = await supabaseAdmin.from('creators').select('name').eq('id', creatorId).maybeSingle();
  const messages = [];
  for (const m of data || []) {
    const at = exportInstant(m.sent_datetime);
    if (m.fan_message_text) messages.push({ message_id: `${m.id}:fan`, from_fan: true, message: m.fan_message_text, sent_at: at });
    messages.push({ message_id: m.id, from_fan: false, message: m.creator_message_text, sent_at: at, chatter: m.sender_name, price: Number(m.price) > 0 ? Number(m.price) : null,
      sold_at: m.purchased ? at : null, sold_net: m.purchased ? Number(m.price) : null, unsent_at: m.status === 'Unsent' ? at : null });
  }
  const last = (data || [])[0];
  return { page: c?.name, fan: { username: fan, nickname: null }, messages, truncated: (data || []).length >= 1000, note: 'From the uploaded chat exports: each reply with the fan message it answered.', last };
}

// ---------------- Fanvue ----------------
async function fvList(orgId, f, { csv = false } = {}) {
  const pages = await FV.fanvuePages(orgId);
  const byId = new Map(pages.map(p => [p.id, p]));
  const args = {
    p_org: orgId, p_accounts: f.account ? [f.account] : null, p_start: Stats.dayStartUtc(f.from).toISOString(), p_end: Stats.dayStartUtc(Stats.addDays(f.to, 1)).toISOString(),
    p_q: f.q, p_fan: f.fan, p_price_min: f.price_min, p_price_max: f.price_max, p_purchased: f.purchased, p_status: f.status, p_replied: f.replied,
  };
  const [res, tot] = await Promise.all([
    rows('fanvue_sent_messages', args, f, csv),
    csv ? { data: [] } : supabaseAdmin.rpc('fanvue_sent_totals', args),
  ]);
  if (res.error) throw res.error;
  if (tot.error) throw tot.error;
  const list = res.data || [];
  const fans = [...new Set(list.map(m => m.fan_uuid))];
  const { data: people } = fans.length ? await supabaseAdmin.from('fanvue_fans').select('account_id, fan_uuid, handle, display_name, nickname').in('fan_uuid', fans) : { data: [] };
  const who = new Map((people || []).map(p => [`${p.account_id}|${p.fan_uuid}`, p]));
  // the sender: whoever was on the page's Fanvue shift when it went out
  const roster = list.length ? await R.loadRoster(orgId, Stats.addDays(f.from, -1), f.to, 'fanvue', { removed: true }).catch(() => null) : null;
  const { data: chs } = await supabaseAdmin.from('chatters').select('id, name').eq('organisation_id', orgId);
  const chName = new Map((chs || []).map(c => [c.id, c.name]));
  const t = totalsOut((tot.data || [])[0]);
  return {
    rows: list.map(m => {
      const p = who.get(`${m.account_id}|${m.fan_uuid}`) || {};
      const on = Stats.onShiftAt(roster, byId.get(m.account_id)?.creator_id, m.sent_at).map(id => chName.get(id)).filter(Boolean);
      return {
        account_id: m.account_id, message_id: m.uuid, group_id: null, fan_account_id: m.fan_uuid, page: byId.get(m.account_id)?.page || 'Fanvue page',
        chatter: on.length ? on.join(', ') : null, kind: m.type === 'CHAT_TEXT_GENERATION' ? 'ai' : 'chat',
        fan_nickname: p.nickname || null, fan_username: p.handle || null, display_name: p.display_name || null,
        prev_fan_text: m.prev_fan_text, message: m.text, sent_at: m.sent_at, reply_s: m.reply_s, price: Number(m.price) || 0,
        sold_at: m.bought ? m.sent_at : null, sold_net: m.sold_net != null ? Number(m.sold_net) : null, unsent_at: m.status === 'UNSENT' ? m.sent_at : null, chat_url: null,
      };
    }),
    page: f.page, size: f.size, total: t.messages, totals: t, my_browsers: [],
  };
}

async function fvFilters(orgId) {
  return { accounts: (await FV.fanvuePages(orgId)).map(p => ({ id: p.id, page: p.page })), chatters: [], no_sender_filter: true };
}

async function fvRecipients(orgId, term) {
  const t = term.replace(/[%_,()]/g, '');
  if (t.length < 2) return [];
  const ids = (await FV.fanvuePages(orgId)).map(p => p.id);
  if (!ids.length) return [];
  const { data } = await supabaseAdmin.from('fanvue_fans').select('account_id, fan_uuid, handle, display_name, nickname').in('account_id', ids)
    .or(`handle.ilike.%${t}%,display_name.ilike.%${t}%,nickname.ilike.%${t}%`).limit(20);
  return (data || []).map(x => ({ fan_account_id: x.fan_uuid, account_id: x.account_id, name: x.nickname || x.display_name || x.handle, username: x.handle }));
}

async function fvConversation(orgId, accountId, fan) {
  const pages = await FV.fanvuePages(orgId);
  const page = pages.find(p => p.id === accountId);
  if (!page) return null;
  const { data, error } = await supabaseAdmin.from('fanvue_messages').select('uuid, from_fan, type, status, text, sent_at').eq('account_id', accountId).eq('fan_uuid', fan)
    .neq('type', 'BROADCAST').order('sent_at', { ascending: false }).limit(1000);
  if (error) throw error;
  const { data: f } = await supabaseAdmin.from('fanvue_fans').select('handle, display_name, nickname').eq('account_id', accountId).eq('fan_uuid', fan).maybeSingle();
  const { data: media } = await supabaseAdmin.from('fanvue_media').select('message_uuid, price_cents, purchased_at').eq('account_id', accountId).eq('fan_uuid', fan).gt('price_cents', 0);
  const ppv = new Map();
  for (const x of media || []) { const p = ppv.get(x.message_uuid) || { price: 0, bought: false }; p.price += x.price_cents / 100; if (x.purchased_at) p.bought = true; ppv.set(x.message_uuid, p); }
  const list = (data || []).reverse();
  return {
    page: page.page, fan: { username: f?.handle, nickname: f?.nickname, display_name: f?.display_name },
    messages: list.map(m => ({ message_id: m.uuid, from_fan: m.from_fan, message: m.text, sent_at: m.sent_at, kind: m.type === 'CHAT_TEXT_GENERATION' ? 'ai' : null,
      price: ppv.get(m.uuid)?.price ?? null, sold_at: ppv.get(m.uuid)?.bought ? m.sent_at : null, unsent_at: m.status === 'UNSENT' ? m.sent_at : null })),
    truncated: (data || []).length >= 1000,
  };
}

const PLATFORM = {
  onlyfans: { list: ofList, filters: ofFilters, recipients: ofRecipients, conversation: ofConversation },
  fanvue: { list: fvList, filters: fvFilters, recipients: fvRecipients, conversation: fvConversation },
};
module.exports = { PLATFORM, filters, exportInstant };
