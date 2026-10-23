/**
 * The bridge between the page script (which lives in the page's world and cannot
 * reach the extension) and the background worker. It forwards what the page
 * copies, and types a script or suggestion from the side panel into Fansly's
 * message box (the chatter still presses send).
 */
(() => {
  const TAG = 'cmt-fansly';
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data[TAG] !== 1) return;
    const { kind, url, data, extra, at } = ev.data;
    try { chrome.runtime.sendMessage({ type: 'fansly-event', kind, url, data, extra, at }); } catch { /* the worker is restarting; the page will send more */ }
  });
  // Tell the worker a Fansly tab is alive (for presence) even before the page talks.
  try { chrome.runtime.sendMessage({ type: 'fansly-tab', url: location.href }); } catch { /* ignore */ }

  // ---- the side panel asks: put this text in the message box ----
  function messageBox() {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 10 && r.bottom > 0 && r.top < innerHeight; };
    const host = document.getElementById('cmt-panel-host');
    const boxes = [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]')].filter(el => !(host && host.contains(el)) && visible(el));
    // the chat's box sits at the bottom of the conversation: take the lowest one
    return boxes.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
  }
  function insert(text) {
    const box = messageBox();
    if (!box) return false;
    box.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
    if (!ok && box.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(box, (box.value ? box.value + ' ' : '') + text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      ok = true;
    }
    return ok;
  }
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg && msg.type === 'cmt-insert' && typeof msg.text === 'string') { respond({ ok: insert(msg.text) }); return false; }
    return false;
  });
})();
