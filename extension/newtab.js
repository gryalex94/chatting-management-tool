// Chrome's own New Tab page (Google's search box and shortcuts) can't be blocked like a website,
// so the extension shows this one instead. A chatter goes straight to the chats.
chrome.runtime.sendMessage({ type: 'cmt-secure-get' }, (r) => {
  void chrome.runtime.lastError;
  if (!r || r.chatOnly) location.replace('https://fansly.com/messages');
  else document.getElementById('text').textContent = 'Manager mode: every website opens. Type an address above.';
});
