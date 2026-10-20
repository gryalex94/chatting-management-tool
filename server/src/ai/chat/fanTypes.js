/**
 * Who a made-up fan is, in the practice room (utils/aiChat.js → reply): the AI
 * gets the same background a real fan's data would give it (his subscription
 * and spending, as Fanvue payments), the Playbook situation for his type, and a
 * plain line on how to approach him. Real fans need none of this: their own
 * payments and chat say who they are.
 */
const DAY = 86400_000;

// His payments, as Fanvue would list them (newest last), relative to `now`.
const sub = (now, daysAgo) => ({ source: 'subscription', gross_cents: 999, paid_at: new Date(now - daysAgo * DAY).toISOString() });
const renewals = (now, fromDaysAgo, toDaysAgo = 0) => {
  const out = [];
  for (let d = fromDaysAgo - 30; d >= toDaysAgo; d -= 30) out.push({ source: 'renewal', gross_cents: 999, paid_at: new Date(now - d * DAY).toISOString() });
  return out;
};
const buys = (now, prices, fromDaysAgo, toDaysAgo, source = 'message') => prices.map((p, i) => ({
  source, gross_cents: Math.round(p * 100),
  paid_at: new Date(now - (fromDaysAgo - ((fromDaysAgo - toDaysAgo) * i) / Math.max(1, prices.length - 1)) * DAY).toISOString(),
}));

const FAN_TYPES = [
  {
    id: 'new_sub', label: 'New subscriber', hint: 'just subscribed: welcome him, get to know him', situation: 'new_sub', chatSince: 0,
    payments: (now) => [sub(now, 0.01)],
    approach: 'He subscribed a few minutes ago and this is your very first chat. Welcome him personally (not like a mass message), then get to know him: his name, where he is from, what he does, what brought him to your page, what he likes. One question at a time, and react to his answers before asking the next. Keep it light and friendly; nothing sexual unless he starts it.',
  },
  {
    id: 'follower', label: 'Free follower', hint: 'follows for free, not subscribed', situation: null, chatSince: 10,
    payments: () => [],
    approach: 'He follows you for free and isn\'t subscribed. Be friendly and curious, get to know him and make him feel welcome. Don\'t pressure him to subscribe or buy anything.',
  },
  {
    id: 'regular', label: 'Subscriber for a while', hint: 'a few weeks in, has bought a little', situation: 'warmed_up', chatSince: 45,
    payments: (now) => [sub(now, 45), ...renewals(now, 45), ...buys(now, [15], 20, 20)],
    approach: 'You have chatted with him on and off for a few weeks. Be familiar and personal: ask how things are going and build on what he tells you.',
  },
  {
    id: 'spender', label: 'Big spender', hint: '$500+, buys often', situation: 'spender', chatSince: 120,
    payments: (now) => [sub(now, 120), ...renewals(now, 120), ...buys(now, [25, 30, 35, 40, 30, 45, 50, 35, 40, 55, 45, 60, 40, 50], 110, 3), ...buys(now, [20, 25, 20], 90, 10, 'tip')],
    approach: 'He is one of your best fans: he has spent a lot with you and buys often. Make him feel special and remembered, take time to really talk with him, be warm and personal. Never pushy.',
  },
  {
    id: 'time_waster', label: 'Time waster', hint: 'chats a lot, never buys', situation: 'time_waster', chatSince: 90,
    payments: (now) => [sub(now, 90), ...renewals(now, 90)],
    approach: 'He chats a lot but in three months he has never bought anything or tipped (only his subscription). Keep it short and friendly: don\'t invest in long chats and give nothing away for free (no free sexting or explicit descriptions). Never cold or rude.',
  },
  {
    id: 'returning', label: 'Back after a break', hint: 'quiet for weeks, writes again', situation: 'returns', chatSince: 100,
    payments: (now) => [sub(now, 100), ...renewals(now, 100), ...buys(now, [20, 25, 30], 80, 28)],
    approach: 'He hasn\'t written for about three weeks; you chatted before and he bought a few things then. Welcome him back warmly and catch up for a few messages; don\'t make him feel guilty for being away.',
  },
];
const byId = Object.fromEntries(FAN_TYPES.map(t => [t.id, t]));

/** A made-up fan's type: { situation, approach, payments, chatSince (ISO) }, or null. */
function fanType(id, now = Date.now()) {
  const t = byId[id];
  if (!t) return null;
  return { id: t.id, label: t.label, situation: t.situation, approach: t.approach, payments: t.payments(now), chatSince: new Date(now - t.chatSince * DAY).toISOString() };
}

module.exports = { FAN_TYPES: FAN_TYPES.map(({ id, label, hint }) => ({ id, label, hint })), fanType };
