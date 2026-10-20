const router = require('express').Router();
const { requireMinRole } = require('../middleware/auth');
const A = require('../utils/aiChat');
const L = require('../utils/contentLibrary');
const D = require('../utils/aiDuels');

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

// GET/PUT /api/ai-chat/pages/:creatorId/profile — her profile { profile, writer, typing, emojis, timezone, drafted }.
router.get('/pages/:creatorId/profile', async (req, res) => {
  try { res.json(await A.getProfile(org(req), req.params.creatorId)); } catch (e) { fail(res, e, 'load her profile'); }
});
router.put('/pages/:creatorId/profile', async (req, res) => {
  try {
    const { profile, writer, typing, emojis, timezone, drafted } = req.body || {};
    if (!profile || typeof profile !== 'object') return res.status(400).json({ error: 'Fill in her profile' });
    res.json(await A.saveProfile(org(req), req.params.creatorId, { profile, writer, typing, emojis, timezone, drafted: !!drafted }, req.user.id));
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
    const { fan_uuid: fanUuid, made_up: madeUp, test, models, selling, follow_up: followUp, what_if: whatIf, plan_only: planOnly, learned, session, outcome } = req.body || {};
    if (fanUuid != null && !FAN_RE.test(String(fanUuid))) return res.status(400).json({ error: 'Fan not found' });
    res.json(await A.reply(org(req), req.params.creatorId, {
      fanUuid: fanUuid || null, madeUp: madeUp && typeof madeUp === 'object' ? madeUp : null,
      test: Array.isArray(test) ? test : [], models: Array.isArray(models) ? models : [],
      selling: selling === true, followUp: followUp === true,
      whatIf: whatIf && typeof whatIf === 'object' ? whatIf : null, planOnly: planOnly === true,
      learned: Array.isArray(learned) ? learned : [],
      session: session && typeof session === 'object' ? session : null,
      outcome: outcome && typeof outcome === 'object' ? outcome : null,
    }));
  } catch (e) { fail(res, e, 'draft a reply'); }
});

// ── Your marks on replies (database change 044): teaching from Practice ──────
// POST /pages/:creatorId/media (a file as "file") — a photo or video uploaded in Practice as
// him: looked at by the describer (ai/chat/vision.js), nothing kept. Returns { media }.
const multer = require('multer');
const lookUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
router.post('/pages/:creatorId/media', lookUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Send a photo or a video' });
    res.json(await A.lookAt(org(req), req.params.creatorId, { buffer: req.file.buffer, mimetype: req.file.mimetype, name: req.file.originalname }));
  } catch (e) { fail(res, e, 'look at the file'); }
});

// Her diary (B9): what she has told fans about herself, the same for everyone.
router.get('/pages/:creatorId/diary', async (req, res) => {
  try { res.json(await A.diary(org(req), req.params.creatorId)); } catch (e) { fail(res, e, 'load her diary'); }
});
router.patch('/pages/:creatorId/diary', async (req, res) => {
  try { res.json(await A.setDiaryFact(org(req), req.params.creatorId, req.body?.text, req.body?.off === true)); } catch (e) { fail(res, e, 'change her diary'); }
});

// GET /pages/:creatorId/checks?days=7 — Claude's checks of Practice replies, added up:
// a score per day and the most common weak points (Q49).
router.get('/pages/:creatorId/checks', async (req, res) => {
  try { res.json(await A.checkScore(org(req), req.params.creatorId, { days: req.query.days })); } catch (e) { fail(res, e, 'load Claude\'s score'); }
});

// POST /pages/:creatorId/feedback { kind, step, note, better, his, her, goal, context }
router.post('/pages/:creatorId/feedback', async (req, res) => {
  try { res.json(await A.saveFeedback(org(req), req.params.creatorId, req.user?.id, req.body || {})); } catch (e) { fail(res, e, 'save your note'); }
});
router.get('/pages/:creatorId/feedback', async (req, res) => {
  try { res.json(await A.listFeedback(org(req), req.params.creatorId)); } catch (e) { fail(res, e, 'load your notes'); }
});
router.patch('/pages/:creatorId/feedback/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: 'Note not found' });
    res.json(await A.setFeedbackActive(org(req), req.params.creatorId, req.params.id, req.body?.active !== false));
  } catch (e) { fail(res, e, 'change your note'); }
});

// ── Her content: what she can sell, described precisely (database change 041) ──
// GET  /api/ai-chat/pages/:creatorId/content          — the list, each item with how spicy it is
// POST /api/ai-chat/pages/:creatorId/content          — add or change an item (body: the item; id = change)
// POST /api/ai-chat/pages/:creatorId/content/starter  — add the starter list (an example to change)
// DELETE /api/ai-chat/pages/:creatorId/content/:itemId
router.get('/pages/:creatorId/content', async (req, res) => {
  try { res.json(await A.contentList(org(req), req.params.creatorId)); } catch (e) { fail(res, e, 'load her content'); }
});
router.post('/pages/:creatorId/content/starter', async (req, res) => {
  try { res.json(await A.addStarterContent(org(req), req.params.creatorId)); } catch (e) { fail(res, e, 'add the starter list'); }
});
router.post('/pages/:creatorId/content', async (req, res) => {
  try { res.json(await A.saveContent(org(req), req.params.creatorId, req.body || {}, req.user.id)); } catch (e) { fail(res, e, 'save the item'); }
});
// POST /api/ai-chat/pages/:creatorId/content/suggest — sellable sets made from her vault (replaces the starter list)
router.post('/pages/:creatorId/content/suggest', async (req, res) => {
  try { res.json(await A.suggestContent(org(req), req.params.creatorId)); } catch (e) { fail(res, e, 'make sets from her vault'); }
});

// ── Her content library: what she has and where it is (database change 042) ──
// GET  /api/ai-chat/pages/:creatorId/library            — her files, where they are, Fanvue's tags, how they sold
// POST /api/ai-chat/pages/:creatorId/library/refresh    — read her Fanvue vault again now
// POST /api/ai-chat/pages/:creatorId/library/previews   — fresh preview links { ids: [assetId], large }: { previews, kinds, problem }
router.get('/pages/:creatorId/library', async (req, res) => {
  try { res.json(await L.library(org(req), req.params.creatorId)); } catch (e) { fail(res, e, 'load her vault'); }
});
router.post('/pages/:creatorId/library/refresh', async (req, res) => {
  try {
    const { account } = await A._engine.pageAccount(org(req), req.params.creatorId);
    const copied = await L.copyFanvueVault(account.id);
    res.json({ ...(await L.library(org(req), req.params.creatorId)), copied });
  } catch (e) { fail(res, e, 'read her vault'); }
});
router.post('/pages/:creatorId/library/previews', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(x => /^\d+$/.test(String(x))) : [];
    res.json(await L.previews(org(req), req.params.creatorId, ids, { large: req.body?.large === true }));
  } catch (e) { fail(res, e, 'load the previews'); }
});

router.delete('/pages/:creatorId/content/:itemId', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.itemId)) return res.status(400).json({ error: 'Not found' });
    res.json(await A.deleteContent(org(req), req.params.creatorId, req.params.itemId));
  } catch (e) { fail(res, e, 'delete the item'); }
});

// ── The blind test: AI against her chatters (utils/aiDuels.js) ──────────────
const BATCH_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/;
const batchOf = (req, res) => {
  const b = String(req.query.batch || '');
  if (!BATCH_RE.test(b)) { res.status(400).json({ error: 'Pick a test run' }); return null; }
  return b;
};

// GET /api/ai-chat/pages/:creatorId/duels — the test runs and the running one.
router.get('/pages/:creatorId/duels', async (req, res) => {
  try { res.json(await D.overview(org(req), req.params.creatorId)); } catch (e) { fail(res, e, 'load the blind tests'); }
});

// POST /api/ai-chat/pages/:creatorId/duels { count } — start a blind test (20–150 moments).
router.post('/pages/:creatorId/duels', async (req, res) => {
  try { res.json({ job: await D.startDuels(org(req), req.params.creatorId, req.body?.count) }); } catch (e) { fail(res, e, 'start the blind test'); }
});

// GET /api/ai-chat/pages/:creatorId/duels/next?batch= — the next moment to judge (blind).
router.get('/pages/:creatorId/duels/next', async (req, res) => {
  const batch = batchOf(req, res); if (!batch) return;
  try { res.json(await D.nextDuel(org(req), req.params.creatorId, batch)); } catch (e) { fail(res, e, 'load the next moment'); }
});

// GET /api/ai-chat/pages/:creatorId/duels/results?batch= — the results, answers revealed.
router.get('/pages/:creatorId/duels/results', async (req, res) => {
  const batch = batchOf(req, res); if (!batch) return;
  try { res.json(await D.results(org(req), req.params.creatorId, batch)); } catch (e) { fail(res, e, 'load the results'); }
});

// POST /api/ai-chat/pages/:creatorId/duels/:duelId/vote { vote: 'A' | 'B' | 'tie' } — returns the next moment.
router.post('/pages/:creatorId/duels/:duelId/vote', async (req, res) => {
  if (!/^\d+$/.test(req.params.duelId)) return res.status(404).json({ error: 'Not found' });
  try { res.json(await D.vote(org(req), req.params.creatorId, Number(req.params.duelId), req.body?.vote, req.user.id)); } catch (e) { fail(res, e, 'save the vote'); }
});

module.exports = router;
