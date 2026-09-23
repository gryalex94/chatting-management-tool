// One place for the role ladder, shared by account creation and staff management.
const ROLE_RANK = { chatter: 0, va: 1, manager: 2, head_manager: 3, admin: 4, owner: 5 };

// Which roles each role may give out (by invite, direct creation or a role
// change). Nobody can grant `owner`, and only the owner can create admins — so
// nobody can ever mint an account more powerful than their own.
const ASSIGNABLE = {
  owner: ['admin', 'head_manager', 'manager', 'chatter', 'va'],
  admin: ['head_manager', 'manager', 'chatter', 'va'],
  head_manager: ['chatter', 'va'],
};

// May `actor` change `target` at all? Only someone strictly above them — the
// owner is untouchable, and nobody edits their own account here.
function canManage(actor, target) {
  if (!actor || !target || actor.id === target.id) return false;
  if (target.role === 'owner') return false;
  return (ROLE_RANK[actor.role] ?? -1) > (ROLE_RANK[target.role] ?? 99);
}

module.exports = { ROLE_RANK, ASSIGNABLE, canManage };
