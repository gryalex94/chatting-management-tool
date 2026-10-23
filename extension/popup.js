// The popup: sign in with the chatter's account, see what is being recorded.
const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise(r => chrome.runtime.sendMessage(msg, r));
const ago = (t) => { if (!t) return 'never'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };

async function render() {
  const st = await send({ type: 'popup-status' });
  if (!st) return;
  $('version').textContent = `Extension ${st.version} · browser ${st.deviceId.slice(0, 8)}`;
  if (!st.session) {
    $('login').hidden = false; $('status').hidden = true;
    $('apiUrl').value = st.apiUrl;
    return;
  }
  $('login').hidden = true; $('status').hidden = false;
  const u = st.session.user || {};
  $('who').textContent = `${u.name || u.email || '?'} (${u.role || '?'})`;
  const s = st.state || {};
  $('account').textContent = s.accountUsername ? `@${s.accountUsername}` : s.accountId ? `#${String(s.accountId).slice(-6)}` : 'not seen yet — open Messages';
  const tabs = await chrome.tabs.query({ url: 'https://fansly.com/*' });
  $('recording').innerHTML = tabs.length ? '<span class="ok">on · Fansly is open</span>' : '<span class="k">waiting for a Fansly tab</span>';
  $('queue').textContent = String(st.queue || 0);
  $('lastSent').textContent = ago(s.lastFlushAt);
  $('total').textContent = String(s.sentTotal || 0);
  $('ledger').textContent = ago(s.lastLedgerAt);
  $('ledgerHint').hidden = !!(s.lastLedgerAt && Date.now() - s.lastLedgerAt < 24 * 3600 * 1000);
  const { panelOff, panelMode } = await chrome.storage.local.get(['panelOff', 'panelMode']);
  const mode = !hasSide && (panelMode || 'side') === 'side' ? 'page' : (panelMode || (panelOff ? 'off' : 'side'));
  if (document.activeElement !== $('panelMode')) $('panelMode').value = mode;
  $('openSide').hidden = mode !== 'side';
  $('sideHint').hidden = hasSide;
  $('panelMode').querySelector('option[value="side"]').disabled = !hasSide;
  $('statusError').textContent = s.lastError || (s.needAccount ? 'Open the Messages page once so the account is known.' : '')
    || (s.assigned === false ? 'You are not on the roster for this page. Your messages are still recorded under your name, but the side panel stays closed. Ask a manager to add you on the Shifts page.' : '');
}

$('signin').addEventListener('click', async () => {
  $('loginError').textContent = '';
  $('signin').disabled = true;
  const out = await send({ type: 'popup-login', email: $('email').value.trim(), password: $('password').value, apiUrl: $('apiUrl').value.trim() });
  $('signin').disabled = false;
  if (!out || out.error) { $('loginError').textContent = (out && out.error) || 'Could not sign in'; return; }
  $('password').value = '';
  render();
});
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('signin').click(); });
$('signout').addEventListener('click', async () => { await send({ type: 'popup-logout' }); render(); });
// Chrome's side panel narrows the page instead of covering it (Chrome 116+; AdsPower's browser too when it is that new)
const hasSide = !!(chrome.sidePanel && chrome.sidePanel.open);
let windowId = null;
chrome.windows.getCurrent((w) => { windowId = w && w.id; });
$('panelMode').addEventListener('change', (e) => { chrome.storage.local.set({ panelMode: e.target.value, panelOff: e.target.value === 'off' }); render(); });
$('openSide').addEventListener('click', () => {
  // opened straight from the click (Chrome only allows it in answer to one)
  if (!hasSide || windowId == null) return;
  chrome.sidePanel.open({ windowId }).then(() => window.close()).catch((e) => { $('statusError').textContent = 'Could not open the side panel: ' + e.message; });
});
if (!hasSide) chrome.storage.local.get('panelMode', ({ panelMode }) => { if (!panelMode || panelMode === 'side') chrome.storage.local.set({ panelMode: 'page' }); });
$('flush').addEventListener('click', async () => { await send({ type: 'popup-flush' }); render(); });

render();
setInterval(render, 3000);
