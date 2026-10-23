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
  $('statusError').textContent = s.lastError || (s.needAccount ? 'Open the Messages page once so the account is known.' : '');
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
$('flush').addEventListener('click', async () => { await send({ type: 'popup-flush' }); render(); });

render();
setInterval(render, 3000);
