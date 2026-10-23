/**
 * The bridge between the page script (which lives in the page's world and cannot
 * reach the extension) and the background worker. It only forwards.
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
})();
