const router = require('express').Router();
const { requireMinRole } = require('../middleware/auth');
const A = require('../utils/aiChat');

// The AI chat for the Fanvue AI creator (utils/aiChat.js): her profile, what she
// remembers about each fan, and the practice room. Managers and up. Nothing here
// sends anything to Fanvue.
router.use(requireMinRole('manager'));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAN_RE = /^[\w-]{1,100}$/;
const fail = (res, e, what) => {
  if (e instanceof A.AiChatError) return res.status(e.status).json({ error: e.message });
  console.error(`[ai-chat] ${what}:`, e.message);
  return res.status(500).json({ error: `Could not ${what}` });
};
const org = (req) => req.user.organisationId;
router.param('creatorId', (req, res, next, id) => (UUID_RE.test(id) ? next() : res.status(404).json({ error: 'Page not found' })));
router.param('fanUuid', (req, res, next, id) => (FAN_RE.test(id) ? next() : res.status(404).json({ error: 'Fan not found' })));

// GET /api/ai-chat — the Fanvue pages, the writers on offer, what's set up on the server.
router.get('/', async (req, res) => {
  try { res.json(await A.pages(org(req))); } catch (e) { fail(res, e, 'load the AI chat'); }
});

// GET /api/ai-chat/usage — what the AI chat cost, today and the last 30 days.
router.get('/usage', async (req, res) => {
  try { res.json(await A.usage(org(req))); } catch (e) { fail(res, e, 'load the AI costs'); }
});

// GET/PUT /api/ai-chat/pages/:creatorId/profile — her profile { profile, writer, drafted }.
router.get('/pages/:creatorId/profile', async (req, res) => {
  try { res.json(await A.getProfile(org(req), req.params.creatorId)); } catch (e) { fail(res, e, 'load her profile'); }
});
router.put('/pages/:creatorId/profile', async (req, res) => {
  try {
    const { profile, writer, drafted } = req.body || {};
    if (!profile || typeof profile !== 'object') return res.status(400).json({ error: 'Fill in her profile' });
    res.json(await A.saveProfile(org(req), req.params.creatorId, { profile, writer, drafted: !!drafted }, req.user.id));
  } catch (e) { fail(res, e, 'save her profile'); }
});

// POST /api/ai-chat/pages/:creatorId/profile/draft — the AI drafts her profile from
// her own past messages (not saved; about 1 cent).
router.post('/pages/:creatorId/profile/draft', async (req, res) => {
  try { res.json(await A.draftProfile(org(req), req.params.creatorId)); } catch (e) { fail(res, e, 'draft her profile'); }
});

// POST /api/ai-chat/pages/:creatorId/profile/generate { description, name, gender, age,
// orientation, vibes, heat, style, from, interests, pet_names, limits, use_history }
// — the AI writes a whole profile from a description and choices (not saved).
router.post('/pages/:creatorId/profile/generate', async (req, res) => {
  try { res.json(await A.generateProfile(org(req), req.params.creatorId, req.body || {})); } catch (e) { fail(res, e, 'generate her profile'); }
});

// GET /api/ai-chat/pages/:creatorId/fans — the fans who wrote, and the memory job.
router.get('/pages/:creatorId/fans', async (req, res) => {
  try { res.json({ fans: await A.fans(org(req), req.params.creatorId), job: A.memoryJob(req.params.creatorId) }); }
  catch (e) { fail(res, e, 'load the fans'); }
});

// GET /api/ai-chat/pages/:creatorId/fans/:fanUuid — one fan: memory, money, the chat the AI reads.
router.get('/pages/:creatorId/fans/:fanUuid', async (req, res) => {
  try { res.json(await A.fanDetail(org(req), req.params.creatorId, req.params.fanUuid)); } catch (e) { fail(res, e, 'load the fan'); }
});

// PUT /api/ai-chat/pages/:creatorId/fans/:fanUuid/memory { facts: [{ id, kind, note, locked }], summary }
router.put('/pages/:creatorId/fans/:fanUuid/memory', async (req, res) => {
  try {
    const { facts, summary } = req.body || {};
    if (!Array.isArray(facts)) return res.status(400).json({ error: 'Send the notes as a list' });
    res.json(await A.saveMemory(org(req), req.params.creatorId, req.params.fanUuid, { facts, summary }));
  } catch (e) { fail(res, e, 'save the memory'); }
});

// POST /api/ai-chat/pages/:creatorId/fans/:fanUuid/memory { full } — update this fan's
// memory from the chat (`full`: start again from the whole chat; locked notes stay).
router.post('/pages/:creatorId/fans/:fanUuid/memory', async (req, res) => {
  try {
    const r = await A.buildMemory(org(req), req.params.creatorId, req.params.fanUuid, { full: !!req.body?.full });
    res.json({ ...(await A.fanDetail(org(req), req.params.creatorId, req.params.fanUuid)), updated: r.updated, cost: r.cost });
  } catch (e) { fail(res, e, 'update the memory'); }
});

// POST/GET /api/ai-chat/pages/:creatorId/memory — build memory for every fan who
// wrote (in the background) / how far it is.
router.post('/pages/:creatorId/memory', async (req, res) => {
  try { res.json({ job: await A.buildAllMemory(org(req), req.params.creatorId) }); } catch (e) { fail(res, e, 'start the memory'); }
});
router.get('/pages/:creatorId/memory', (req, res) => res.json({ job: A.memoryJob(req.params.creatorId) }));

// POST /api/ai-chat/pages/:creatorId/reply { fan_uuid, made_up: { name, notes }, test:
// [{ from: 'fan' | 'her', text }], models: [...] } — draft her reply in the practice
// room. Only shown in the tool; nothing is sent to Fanvue.
router.post('/pages/:creatorId/reply', async (req, res) => {
  try {
    const { fan_uuid: fanUuid, made_up: madeUp, test, models } = req.body || {};
    if (fanUuid != null && !FAN_RE.test(String(fanUuid))) return res.status(400).json({ error: 'Fan not found' });
    res.json(await A.reply(org(req), req.params.creatorId, {
      fanUuid: fanUuid || null, madeUp: madeUp && typeof madeUp === 'object' ? madeUp : null,
      test: Array.isArray(test) ? test : [], models: Array.isArray(models) ? models : [],
    }));
  } catch (e) { fail(res, e, 'draft a reply'); }
});

module.exports = router;
