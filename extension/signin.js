// The page a browser sees instead of Fansly while nobody is signed in to the extension.
const $ = (id) => document.getElementById(id);
const send = (msg) => new Promise(r => chrome.runtime.sendMessage(msg, r));
send({ type: 'popup-status' }).then((st) => {
  if (!st) return;
  if (st.session) { location.replace('https://fansly.com/messages'); return; }   // signed in already (another tab)
  $('version').textContent = `Extension ${st.version} · browser ${st.deviceId.slice(0, 8)}`;
});
$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('err').textContent = '';
  $('signin').disabled = true;
  const out = await send({ type: 'popup-login', email: $('email').value.trim(), password: $('password').value });
  $('signin').disabled = false;
  if (!out || out.error) { $('err').textContent = (out && out.error) || 'Could not sign in'; return; }
  location.replace('https://fansly.com/messages');
});
