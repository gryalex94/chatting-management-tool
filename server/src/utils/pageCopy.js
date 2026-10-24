/**
 * Copy a page's settings from another page (the same creator on OnlyFans, Fanvue and Fansly). Copied
 * once: afterwards the two pages are separate (to keep the creator profile shared, link it instead:
 * creators.profile_from, utils/aiChat.js). Each part:
 *   profile   the creator profile the AI writes from (ai_personas): replaces this page's
 *   facts     page facts and AI context (creators.ai_context / ai_instructions): replaces this page's
 *   rules     the AI rules made for the source page (ai_rules, active): added, the same text once
 *   content   the content catalogue (ai_content): added without its media (files differ per platform)
 *   scripts   the scripts library for the source page: added, text only (media is picked again)
 *   credit    Fansly's credit rules: Fansly page to Fansly page only
 */
const { supabaseAdmin } = require('./supabase');

const PARTS = ['profile', 'facts', 'rules', 'content', 'scripts', 'credit'];
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

async function pageOf(orgId, id) {
  const { data } = await supabaseAdmin.from('creators').select('id, name, platform, ai_context, ai_instructions, profile_from').eq('organisation_id', orgId).eq('id', id).maybeSingle();
  return data ? { ...data, platform: data.platform || 'onlyfans' } : null;
}
const fanslyAccountOf = async (creatorId) => (await supabaseAdmin.from('fansly_accounts').select('id, credit_rules').eq('creator_id', creatorId).limit(1).maybeSingle()).data;

/** What the source page has, per part (for the dialog's counts). */
async function whatItHas(orgId, sourceId) {
  const src = await pageOf(orgId, sourceId);
  if (!src) return null;
  const head = (q) => q.then(r => r.count || 0);
  const acc = src.platform === 'fansly' ? await fanslyAccountOf(src.id) : null;
  const [profile, rules, content, scripts] = await Promise.all([
    head(supabaseAdmin.from('ai_personas').select('creator_id', { count: 'exact', head: true }).eq('creator_id', src.id)),
    head(supabaseAdmin.from('ai_rules').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('creator_id', src.id).eq('status', 'active')),
    head(supabaseAdmin.from('ai_content').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('creator_id', src.id)),
    src.platform === 'fansly'
      ? (acc ? head(supabaseAdmin.from('fansly_scripts').select('id', { count: 'exact', head: true }).eq('platform', 'fansly').eq('account_id', acc.id)) : 0)
      : head(supabaseAdmin.from('fansly_scripts').select('id', { count: 'exact', head: true }).eq('platform', src.platform).eq('creator_id', src.id)),
  ]);
  return { page: { id: src.id, name: src.name, platform: src.platform }, profile: profile > 0, facts: !!(src.ai_context || src.ai_instructions), rules, content, scripts, credit: !!acc?.credit_rules };
}

/** Copy the chosen parts from sourceId onto targetId. Returns what was copied, per part. */
async function copyPage(orgId, userId, targetId, sourceId, parts) {
  const [dst, src] = await Promise.all([pageOf(orgId, targetId), pageOf(orgId, sourceId)]);
  if (!dst || !src) throw Object.assign(new Error('No such page'), { status: 404 });
  if (dst.id === src.id) throw Object.assign(new Error('Pick another page to copy from'), { status: 400 });
  const want = new Set((parts || []).filter(p => PARTS.includes(p)));
  const done = {};

  if (want.has('profile')) {
    const { data: p } = await supabaseAdmin.from('ai_personas').select('profile, settings').eq('creator_id', src.id).maybeSingle();
    if (p) {
      const { error } = await supabaseAdmin.from('ai_personas').upsert({ creator_id: dst.id, organisation_id: orgId, profile: p.profile, settings: p.settings, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'creator_id' });
      if (error) throw error;
      // a copied profile is this page's own from now on
      if (dst.profile_from) await supabaseAdmin.from('creators').update({ profile_from: null }).eq('id', dst.id);
      done.profile = true;
    } else done.profile = false;
  }
  if (want.has('facts')) {
    const { error } = await supabaseAdmin.from('creators').update({ ai_context: src.ai_context, ai_instructions: src.ai_instructions }).eq('id', dst.id);
    if (error) throw error;
    done.facts = !!(src.ai_context || src.ai_instructions);
  }
  if (want.has('rules')) {
    const [{ data: from }, { data: have }] = await Promise.all([
      supabaseAdmin.from('ai_rules').select('area, rule, why').eq('organisation_id', orgId).eq('creator_id', src.id).eq('status', 'active'),
      supabaseAdmin.from('ai_rules').select('rule').eq('organisation_id', orgId).eq('creator_id', dst.id),
    ]);
    const seen = new Set((have || []).map(r => norm(r.rule)));
    const rows = (from || []).filter(r => !seen.has(norm(r.rule))).map(r => ({ organisation_id: orgId, creator_id: dst.id, area: r.area, rule: r.rule, why: r.why, status: 'active', source: 'manual', created_by: userId, decided_by: userId, decided_at: new Date().toISOString() }));
    if (rows.length) { const { error } = await supabaseAdmin.from('ai_rules').insert(rows); if (error) throw error; }
    done.rules = rows.length;
  }
  if (want.has('content')) {
    const cols = 'title, kind, amount, minutes, nudity, focus, outfit, setting, action, face, tags, description, price, min_price, notes, active, sort, series, step';
    const [{ data: from }, { data: have }] = await Promise.all([
      supabaseAdmin.from('ai_content').select(cols).eq('organisation_id', orgId).eq('creator_id', src.id),
      supabaseAdmin.from('ai_content').select('title').eq('organisation_id', orgId).eq('creator_id', dst.id),
    ]);
    const seen = new Set((have || []).map(r => norm(r.title)));
    const rows = (from || []).filter(r => !seen.has(norm(r.title))).map(r => ({ ...r, organisation_id: orgId, creator_id: dst.id, asset_ids: [], source: 'copied' }));
    if (rows.length) { const { error } = await supabaseAdmin.from('ai_content').insert(rows); if (error) throw error; }
    done.content = rows.length;
  }
  if (want.has('scripts')) {
    // where a page's scripts live: Fansly by its Fansly account, the others by the page
    const place = async (p) => (p.platform === 'fansly' ? { platform: 'fansly', account_id: (await fanslyAccountOf(p.id))?.id || null } : { platform: p.platform, creator_id: p.id });
    const [s, d] = await Promise.all([place(src), place(dst)]);
    let q = supabaseAdmin.from('fansly_scripts').select('stage, title, text, position, active').eq('organisation_id', orgId).eq('platform', s.platform);
    q = s.account_id !== undefined ? (s.account_id ? q.eq('account_id', s.account_id) : null) : q.eq('creator_id', s.creator_id);
    const { data: from } = q ? await q : { data: [] };
    let h = supabaseAdmin.from('fansly_scripts').select('title, text').eq('organisation_id', orgId).eq('platform', d.platform);
    h = d.account_id !== undefined ? h.eq('account_id', d.account_id) : h.eq('creator_id', d.creator_id);
    const { data: have } = await h;
    const seen = new Set((have || []).map(r => norm(r.title) + '|' + norm(r.text)));
    const rows = (from || []).filter(r => !seen.has(norm(r.title) + '|' + norm(r.text)))
      .map(r => ({ organisation_id: orgId, platform: d.platform, account_id: d.account_id || null, creator_id: d.creator_id || null, stage: r.stage, title: r.title, text: r.text, position: r.position, active: r.active, created_by: userId }));
    if (rows.length && (d.platform !== 'fansly' || d.account_id)) { const { error } = await supabaseAdmin.from('fansly_scripts').insert(rows); if (error) throw error; }
    done.scripts = d.platform === 'fansly' && !d.account_id ? 0 : rows.length;
  }
  if (want.has('credit')) {
    if (src.platform !== 'fansly' || dst.platform !== 'fansly') done.credit = false;
    else {
      const [a, b] = await Promise.all([fanslyAccountOf(src.id), fanslyAccountOf(dst.id)]);
      if (a && b) { const { error } = await supabaseAdmin.from('fansly_accounts').update({ credit_rules: a.credit_rules }).eq('id', b.id); if (error) throw error; }
      done.credit = !!(a && b);
    }
  }
  return { from: { id: src.id, name: src.name, platform: src.platform }, copied: done };
}

module.exports = { PARTS, whatItHas, copyPage };
