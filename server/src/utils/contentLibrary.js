/**
 * Her content library (database change 042): what she has and where it is.
 *  - copyFanvueVault: the hourly Fanvue copy reads her vault (folders and media,
 *    with Fanvue's own AI description and content tags) into content_assets, one
 *    row per photo or video, and content_locations (Fanvue, its media id, folder).
 *    Other platforms (OnlyFans, Fansly) can add locations to the same assets later.
 *  - library: the assets with where they are, what Fanvue says is in them, how
 *    they did as PPVs in her chats, and which of her sellable items use them.
 *  - previews: fresh small preview links (Fanvue's links expire).
 * Read-only towards Fanvue.
 */
const { supabaseAdmin } = require('./supabase');
const fv = require('../integrations/fanvue');
const { personaProblems } = require('../ai/chat/safety');

const LIB_MISSING = 'Run database change 042 (her content library) in Supabase first';
const clean = (s) => String(s ?? '').trim();
const list = (v) => (Array.isArray(v) ? v.map(x => clean(x).toLowerCase()).filter(x => x && x !== 'none') : []);
// Fanvue's descriptions sometimes call her "young": she is an adult, and the AI never says otherwise.
const adult = (t) => clean(t).replace(/\b(?:young|youthful|teen(?:age)?)\s+(?=woman|women|lady|girl|female|asian|latina)/gi, '').replace(/\s{2,}/g, ' ');
const notYoung = (arr) => arr.filter(x => !personaProblems(x).length);

/** Fanvue's AI content tags, in our words. */
function fromFanvueTags(t) {
  if (!t || typeof t !== 'object') return {};
  return {
    tags: notYoung(list(t.tags)), nsfw: t.isNsfw === true, categories: notYoung(list(t.nsfwCategory)),
    acts: list(t.sexActs), objects: list(t.sexObjects), body: list(t.bodyParts), setting: list(t.setting),
    position: list(t.position), people: list(t.people), look: notYoung([...list(t.skinColor), ...list(t.bodyType), ...list(t.hairColor)]),
    other: notYoung(list(t.otherTags)), important: notYoung(list(t.importantTags)),
  };
}

async function pagesOf(accountId, path, params = {}) {
  let cursor = null, out = [];
  do {
    const b = await fv.request(accountId, path, { params: { ...params, size: 50, cursor: cursor || undefined } });
    out = out.concat(b?.data || []);
    cursor = b?.nextCursor || null;
  } while (cursor && out.length < 20000);
  return out;
}

/**
 * Copy her Fanvue vault into the library: new or changed media get Fanvue's tags
 * (20 per request); media gone from the vault are marked removed. Returns counts.
 */
async function copyFanvueVault(accountId) {
  const { data: acc, error } = await supabaseAdmin.from('fanvue_accounts').select('id, organisation_id, creator_id').eq('id', accountId).single();
  if (error) throw error;
  if (!acc.creator_id) return { skipped: 'no page linked' };
  const probe = await supabaseAdmin.from('content_locations').select('asset_id').limit(1);
  if (probe.error) return { skipped: LIB_MISSING };

  const media = await pagesOf(accountId, '/v1/media');
  const folders = await pagesOf(accountId, '/v1/vault/folders');
  const folderOf = {};
  for (const f of folders) for (const m of await pagesOf(accountId, `/v1/vault/folders/${encodeURIComponent(f.name)}/media`)) (folderOf[m.uuid] ||= []).push(f.name);

  const { data: have } = await supabaseAdmin.from('content_locations').select('asset_id, external_id, status, folder, name').eq('platform', 'fanvue').eq('account_id', accountId);
  const known = new Map((have || []).map(l => [l.external_id, l]));
  const { data: tagged } = await supabaseAdmin.from('content_assets').select('id, description').eq('creator_id', acc.creator_id);
  const hasTags = new Set((tagged || []).filter(a => a.description).map(a => a.id));
  // read in detail: new ones, ones whose status changed, and ones still without Fanvue's tags
  const todo = media.filter((m) => { const k = known.get(m.uuid); return !k || k.status !== m.status || !hasTags.has(k.asset_id); });
  let added = 0, updated = 0;
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const body = await fv.request(accountId, '/v1/media/bulk', { params: { mediaUuids: batch.map(m => m.uuid).join(','), variants: 'main' } });
    const results = body?.results || {};
    for (const m of batch) {
      const d = results[m.uuid] || m;
      const main = (d.variants || []).find(v => v.variantType === 'main');
      const row = {
        organisation_id: acc.organisation_id, creator_id: acc.creator_id,
        kind: ['image', 'video', 'audio'].includes(d.mediaType || m.mediaType) ? (d.mediaType || m.mediaType) : 'other',
        description: adult(d.tags?.description || d.description || m.description) || null, tags: fromFanvueTags(d.tags),
        length_ms: main?.lengthMs ? Math.round(main.lengthMs) : null, width: main?.width ? Math.round(main.width) : null, height: main?.height ? Math.round(main.height) : null,
        created_at: d.createdAt || m.createdAt || null, updated_at: new Date().toISOString(),
      };
      const k = known.get(m.uuid);
      let assetId = k?.asset_id;
      if (assetId) {
        const { error: e } = await supabaseAdmin.from('content_assets').update(row).eq('id', assetId);
        if (e) throw e;
        updated += 1;
      } else {
        const { data: ins, error: e } = await supabaseAdmin.from('content_assets').insert(row).select('id').single();
        if (e) throw e;
        assetId = ins.id;
        added += 1;
      }
      const { error: e2 } = await supabaseAdmin.from('content_locations').upsert({
        asset_id: assetId, platform: 'fanvue', account_id: accountId, external_id: m.uuid,
        folder: (folderOf[m.uuid] || []).join(', ') || null, name: clean(d.name || m.name) || null, status: d.status || m.status || null, synced_at: new Date().toISOString(),
      }, { onConflict: 'platform,external_id' });
      if (e2) throw e2;
    }
  }
  // folders and names of the rest, and what's gone from the vault
  const inVault = new Set(media.map(m => m.uuid));
  for (const m of media) {
    const k = known.get(m.uuid);
    const folder = (folderOf[m.uuid] || []).join(', ') || null;
    if (k && !todo.includes(m) && (k.folder !== folder || k.name !== (clean(m.name) || null))) {
      await supabaseAdmin.from('content_locations').update({ folder, name: clean(m.name) || null, synced_at: new Date().toISOString() }).eq('platform', 'fanvue').eq('external_id', m.uuid);
    }
  }
  let removed = 0;
  for (const [id, k] of known) {
    if (!inVault.has(id) && k.status !== 'removed') {
      await supabaseAdmin.from('content_locations').update({ status: 'removed', synced_at: new Date().toISOString() }).eq('platform', 'fanvue').eq('external_id', id);
      removed += 1;
    }
  }
  return { media: media.length, folders: folders.length, added, updated, removed };
}

/** Her assets with where they are, what's in them, how they sold, and which items use them. */
async function library(orgId, creatorId) {
  const { data: assets, error } = await supabaseAdmin.from('content_assets').select('*').eq('organisation_id', orgId).eq('creator_id', creatorId).order('created_at', { ascending: false });
  if (error) {
    if (/content_assets/.test(error.message)) return { ready: false, assets: [] };
    throw new Error(error.message);
  }
  const ids = assets.map(a => a.id);
  const [{ data: locs }, { data: items }] = await Promise.all([
    ids.length ? supabaseAdmin.from('content_locations').select('*').in('asset_id', ids) : { data: [] },
    supabaseAdmin.from('ai_content').select('id, title, asset_ids, series, step').eq('organisation_id', orgId).eq('creator_id', creatorId),
  ]);
  const where = {};
  for (const l of locs || []) (where[l.asset_id] ||= []).push(l);
  // how each Fanvue item did in her chats (sent, as a PPV, bought, at what prices)
  const fanvueIds = (locs || []).filter(l => l.platform === 'fanvue').map(l => l.external_id);
  const stats = {};
  for (let i = 0; i < fanvueIds.length; i += 200) {
    const { data } = await supabaseAdmin.from('fanvue_media').select('media_uuid, price_cents, purchased_at').eq('from_fan', false).in('media_uuid', fanvueIds.slice(i, i + 200));
    for (const u of data || []) {
      const x = (stats[u.media_uuid] ||= { sent: 0, ppv: 0, bought: 0, prices: [] });
      x.sent += 1;
      if (u.price_cents) { x.ppv += 1; x.prices.push(u.price_cents / 100); if (u.purchased_at) x.bought += 1; }
    }
  }
  const usedBy = {};
  for (const it of items || []) for (const a of it.asset_ids || []) (usedBy[a] ||= []).push({ id: it.id, title: it.title, series: it.series, step: it.step });
  return {
    ready: true, connection: await connection(creatorId),
    assets: assets.map((a) => {
      const loc = where[a.id] || [];
      const fv_ = loc.find(l => l.platform === 'fanvue');
      const st = fv_ ? stats[fv_.external_id] : null;
      return {
        ...a, locations: loc.map(l => ({ platform: l.platform, folder: l.folder, name: l.name, status: l.status })),
        sales: st ? { sent: st.sent, ppv: st.ppv, bought: st.bought, low: st.prices.length ? Math.min(...st.prices) : null, high: st.prices.length ? Math.max(...st.prices) : null } : null,
        used_by: usedBy[a.id] || [],
      };
    }),
  };
}

const RECONNECT = 'Fanvue needs connecting again (Settings → Fanvue): the previews come straight from her Fanvue vault.';

/**
 * Fresh preview links for some assets (Fanvue's links expire): small ones, or with
 * `large` the full photo or the video itself. Returns { previews: { assetId: url },
 * kinds: { assetId: kind }, problem } (problem: why there are none, e.g. Fanvue
 * needs connecting again).
 */
async function previews(orgId, creatorId, assetIds, { large = false } = {}) {
  const ids = [...new Set(assetIds.map(Number).filter(Boolean))].slice(0, large ? 1 : 100);
  const out = { previews: {}, kinds: {}, problem: null };
  if (!ids.length) return out;
  const { data: locs } = await supabaseAdmin.from('content_locations').select('asset_id, platform, account_id, external_id, content_assets!inner(organisation_id, creator_id, kind)')
    .in('asset_id', ids).eq('platform', 'fanvue').eq('content_assets.organisation_id', orgId).eq('content_assets.creator_id', creatorId);
  const byAccount = {};
  for (const l of locs || []) { out.kinds[l.asset_id] = l.content_assets?.kind || null; (byAccount[l.account_id] ||= []).push(l); }
  const types = large ? ['main'] : ['thumbnail_gallery', 'thumbnail'];
  try {
    for (const [accountId, list_] of Object.entries(byAccount)) {
      for (let i = 0; i < list_.length; i += 20) {
        const batch = list_.slice(i, i + 20);
        const body = await fv.request(accountId, '/v1/media/bulk', { params: { mediaUuids: batch.map(l => l.external_id).join(','), variants: types.join(',') } });
        for (const l of batch) {
          const variants = body?.results?.[l.external_id]?.variants || [];
          const v = types.map(t => variants.find(x => x.variantType === t)).find(Boolean);
          if (v?.url) out.previews[l.asset_id] = v.url;
        }
      }
    }
  } catch (e) {
    out.problem = e.reconnect ? RECONNECT : `Fanvue didn't give the previews: ${e.message}`;
  }
  return out;
}

/** Whether her Fanvue connection works (for the content screens). */
async function connection(creatorId) {
  const { data } = await supabaseAdmin.from('fanvue_accounts').select('status, sync_error, synced_at').eq('creator_id', creatorId).maybeSingle();
  return data ? { status: data.status, error: data.sync_error, synced_at: data.synced_at, problem: data.status === 'reconnect' ? RECONNECT : null } : null;
}

module.exports = { copyFanvueVault, library, previews, connection, fromFanvueTags, adult, LIB_MISSING };
