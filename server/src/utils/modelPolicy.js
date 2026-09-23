// Which AI model a request may use. Opus costs several times more per review, so
// only admins and owners can choose it; anyone else asking for it gets sonnet.
const ALLOWED = new Set(['haiku', 'sonnet', 'opus']);
const PRIVILEGED = new Set(['admin', 'owner']);

function allowedModel(requested, role) {
  const m = ALLOWED.has(requested) ? requested : 'sonnet';
  return m === 'opus' && !PRIVILEGED.has(role) ? 'sonnet' : m;
}

module.exports = { allowedModel };
