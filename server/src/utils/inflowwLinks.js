// Infloww's "Copy chat link": https://chatlink.infloww.com?cid=<base64>&fid=<base64>
// cid = Infloww's ID for the page, fid = the fan's OnlyFans ID. Returns
// { cid, fid } (digits) or null when the text isn't such a link.
function parseChatLink(input) {
  try {
    const url = new URL(String(input || '').trim());
    const dec = (k) => {
      const v = url.searchParams.get(k);
      const d = v ? Buffer.from(v, 'base64').toString('utf8').trim() : '';
      return /^[0-9]{1,30}$/.test(d) ? d : null;
    };
    const cid = dec('cid'), fid = dec('fid');
    return cid && fid ? { cid, fid } : null;
  } catch { return null; }
}

// The OnlyFans ID hidden in a default username ("u70780636" → "70780636").
const idFromUsername = (u) => /^u(\d+)$/.exec(String(u || '').trim())?.[1] || null;

module.exports = { parseChatLink, idFromUsername };
