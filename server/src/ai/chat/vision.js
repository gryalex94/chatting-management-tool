/**
 * What a fan's photo or video shows (your answers C1–C9 in AI_CHAT_UPGRADE_QUESTIONS.md).
 * A cheap Mistral model looks once and writes one very detailed, neutral description
 * that the planner, the writer, his notes and Claude's check all read. Safety comes
 * first in the same look: anyone who could be under 18, or anything illegal, and the
 * AI leaves the conversation and flags it; nothing is described or sent on. Videos
 * are 4–6 still frames, described as a sequence. Files are never kept: only the text.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const or = require('../../integrations/openrouter');

const DESCRIBER = 'mistralai/mistral-small-2603';
const BACKUPS = ['mistralai/mistral-medium-3.1', 'mistralai/mistral-large-2512'];
const MAX_BYTES = 40 * 1024 * 1024;          // a file bigger than this isn't looked at
const FRAMES = 5;
const KINDS = ['selfie', 'his face', 'his body', 'his dick', 'him jerking off', 'him naked', 'his dog', 'his cat', 'a pet', 'his car', 'a meal', 'a drink', 'a place', 'a view', 'a screenshot', 'a meme', 'a document', 'another person', 'other'];
const clean = (s) => String(s ?? '').trim();

// ffmpeg: the bundled one when installed (ffmpeg-static), else the system's
let FFMPEG = 'ffmpeg';
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg'; } catch { /* the system's ffmpeg, if any */ }
const run = (args, { timeoutMs = 60_000 } = {}) => new Promise((resolve, reject) => {
  execFile(FFMPEG, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => (err && !/Duration/.test(String(stderr)) ? reject(new Error(`ffmpeg: ${String(stderr || err.message).slice(-300)}`)) : resolve({ stdout: String(stdout), stderr: String(stderr) })));
});
async function hasFfmpeg() {
  try { await run(['-version'], { timeoutMs: 10_000 }); return true; } catch { return false; }
}

/** A JPEG of the image at `file`, no wider than 1024px (smaller to send, enough to see). */
async function smallImage(file, dir) {
  const out = path.join(dir, 'small.jpg');
  await run(['-y', '-i', file, '-vf', 'scale=\'min(1024,iw)\':-2', '-q:v', '4', out]);
  return out;
}
/** `n` frames spread over a video, as JPEGs. */
async function frames(file, dir, n = FRAMES) {
  const probe = await run(['-i', file]).catch(e => ({ stderr: e.message }));
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probe.stderr || '');
  const secs = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  const count = secs < 4 ? Math.max(2, Math.min(n, Math.ceil(secs))) : n;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const t = secs > 0 ? (secs * (i + 0.5)) / count : i;          // the middle of each slice
    const f = path.join(dir, `frame-${i + 1}.jpg`);
    try {
      await run(['-y', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=\'min(768,iw)\':-2', '-q:v', '5', f]);
      if (fs.existsSync(f)) out.push(f);
    } catch { /* a frame past the end: skip it */ }
  }
  return { files: out, seconds: secs };
}

const SYSTEM = 'You describe photos and video frames that adult fans send to an adult creator on a subscription site for verified adults. '
  + 'Nudity and sexual content between adults are allowed and must be described plainly, in neutral words, in detail. You never refuse to describe adult content. '
  + 'Safety comes first: if anyone in the picture is, or could be, under 18, or if it shows anything illegal (sexual content involving a minor, an animal, or violence against someone), you say so and describe nothing. Answer with JSON only.';
function ask(mediaKind, nFrames, seconds) {
  return `${mediaKind === 'video' ? `These are ${nFrames} frames from one video he sent, in order${seconds ? ` (about ${Math.round(seconds)} seconds long)` : ''}.` : 'This is a photo he sent.'} Reply with JSON only:\n`
    + '{"minor": "no", "illegal": "no", "safety_why": "", "kind": "...", "sexual": "none", "people": "...", "description": "...", "details": ["..."], "text_in_it": ""}\n'
    + '- minor: "no", "unsure" or "yes": does anyone shown look under 18, child-like, or in a school or child setting? "unsure" when you cannot tell. illegal: "yes" if it shows sexual content with a minor, with an animal, or real violence against a person; else "no". safety_why: a few words.\n'
    + '- If minor is not "no" or illegal is "yes": description "", details [], and stop.\n'
    + `- kind: one of ${KINDS.join(', ')}.\n`
    + '- sexual: "none", "suggestive" (underwear, a bulge, a tease) or "explicit" (genitals, masturbation, sex).\n'
    + '- people: who is in it: "him" (the fan himself), "nobody", "him and others", "a woman", "a group"…\n'
    + '- description: what it shows, in full. A harmless photo: 2–4 sentences with the specifics she could react to (the dog\'s breed, colour and what it is doing; the car; what is on the plate; the room, the light, what he is wearing, his expression). Sexual content: 4–8 sentences, plainly and in neutral words: what he is doing, where he is, what is visible, his body (build, hair, tattoos, size as it looks), what he is wearing or not, and for a video how it goes from the first frame to the last. The creator must be able to react to a real detail and carry the conversation on.\n'
    + '- details: 3–6 short, specific things she could mention ("a golden retriever asleep on a grey couch", "a tattoo of a wolf on his forearm").\n'
    + '- text_in_it: any readable text in the picture, else "".';
}
const dataUrl = (file) => `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;

/**
 * Describe a file that is already on disk. `mediaKind` = 'image' | 'video'.
 * Returns { flagged, minor, illegal, safety_why, kind, sexual, people, description,
 * details, text_in_it, frames, model, usage }. Never throws for a bad answer: a
 * failure comes back as { failed: true, error }.
 */
async function describeFile(file, mediaKind, { dir } = {}) {
  const work = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'yuna-media-'));
  try {
    let shots = [], seconds = 0;
    if (mediaKind === 'video') {
      const f = await frames(file, work);
      shots = f.files; seconds = f.seconds;
      if (!shots.length) return { failed: true, error: 'No frame could be read from the video' };
    } else {
      try { shots = [await smallImage(file, work)]; } catch { shots = [file]; }   // no ffmpeg: the file as it is
      if (!fs.existsSync(shots[0])) shots = [file];                               // ffmpeg wrote nothing (an odd format): the file as it is
    }
    const content = [{ type: 'text', text: ask(mediaKind, shots.length, seconds) }, ...shots.map(f => ({ type: 'image_url', image_url: { url: dataUrl(f) } }))];
    const res = await or.chat({ model: DESCRIBER, fallbacks: BACKUPS, maxTokens: 900, temperature: 0.2, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }] });
    const j = parse(res.text);
    if (!j) return { failed: true, error: 'The describer\'s answer couldn\'t be read', model: res.model, usage: res.usage };
    const minor = ['no', 'unsure', 'yes'].includes(j.minor) ? j.minor : 'unsure';
    const illegal = j.illegal === 'yes' ? 'yes' : 'no';
    const flagged = minor !== 'no' || illegal === 'yes';
    const people = clean(j.people).slice(0, 60);
    let kind = KINDS.includes(j.kind) ? j.kind : 'other';
    // "his body" when the person in it isn't him: someone else, or nobody
    if (/^(?:his|him)\b/.test(kind) && /\b(?:woman|girl|female|lady|group|several|couple|nobody|no one|someone else|another)\b/i.test(people)) kind = /\b(?:nobody|no one)\b/i.test(people) ? 'other' : 'another person';
    return {
      flagged, minor, illegal, safety_why: clean(j.safety_why).slice(0, 200),
      kind,
      sexual: ['none', 'suggestive', 'explicit'].includes(j.sexual) ? j.sexual : 'none',
      people,
      description: flagged ? '' : clean(j.description).slice(0, 1500),
      details: flagged ? [] : (Array.isArray(j.details) ? j.details : []).map(clean).filter(Boolean).slice(0, 6),
      text_in_it: flagged ? '' : clean(j.text_in_it).slice(0, 300),
      frames: shots.length, seconds: Math.round(seconds), model: res.model, usage: res.usage,
    };
  } catch (e) {
    return { failed: true, error: e.message };
  } finally {
    if (!dir) fs.rmSync(work, { recursive: true, force: true });                 // nothing of the file is kept
  }
}

/** Describe a file held in memory (an upload, or a download): written to a temporary folder, then deleted. */
async function describeBuffer(buffer, mediaKind, { name = 'file' } = {}) {
  if (!buffer || !buffer.length) return { failed: true, error: 'An empty file' };
  if (buffer.length > MAX_BYTES) return { failed: true, error: 'The file is too big to look at' };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'yuna-media-'));
  try {
    const file = path.join(work, `in${path.extname(name) || (mediaKind === 'video' ? '.mp4' : '.jpg')}`);
    fs.writeFileSync(file, buffer);
    return await describeFile(file, mediaKind, { dir: work });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Download a file from a link (a signed Fanvue link) and describe it; the file is deleted after. */
async function describeUrl(url, mediaKind) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) return { failed: true, error: `Couldn't download it (${res.status})` };
  const buf = Buffer.from(await res.arrayBuffer());
  return describeBuffer(buf, mediaKind, { name: new URL(url).pathname.split('/').pop() || 'file' });
}

function parse(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

/** The description as the chat shows it: "a photo of his dog: a golden retriever asleep…" */
function seenText(seen) {
  if (!seen) return '';
  if (seen.flagged) return `a ${seen.video ? 'video' : 'photo'} that was flagged and not looked at`;
  if (seen.failed || !seen.description) return `a ${seen.video ? 'video' : 'photo'} that couldn't be seen`;
  return `a ${seen.video ? 'video' : 'photo'} of ${seen.kind}: ${seen.description}`;
}

// Does her reply pick up something from what he sent? (one specific word from the details or the description)
const STOP = new Set('with that this from your into about what when where there their them they have been just like really very some more much than then also only over such your you are the and for his her she him its one two out off not can but was were will would could should there here'.split(' '));
const words = (t) => new Set((String(t).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).filter(w => !STOP.has(w)));
function reactsTo(messages, seen) {
  if (!seen || seen.flagged || !seen.description) return true;
  const hers = words(messages.join(' '));
  const theirs = words([...(seen.details || []), seen.description, seen.kind].join(' '));
  for (const w of theirs) if (hers.has(w) || [...hers].some(h => h.length >= 5 && (w.startsWith(h) || h.startsWith(w)))) return true;
  return false;
}

module.exports = { describeFile, describeBuffer, describeUrl, seenText, reactsTo, hasFfmpeg, DESCRIBER, KINDS };
