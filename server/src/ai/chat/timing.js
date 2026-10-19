/**
 * How long she takes to answer, so a reply arrives like a person texting: a
 * moment to read his message, then each of her messages typed at her speed, one
 * after another with a short pause, never all in the same second. A little
 * randomness keeps it from looking mechanical. Used by the practice room now and
 * by sending later. Pure (no database, no network).
 */

// Her typing speed (set in her profile): letters per second, how long she takes to
// read and react to his message, and the pause between two of her messages (ms).
const SPEEDS = {
  relaxed: { cps: 3, react: [4000, 9000], gap: [1500, 4000] },
  normal: { cps: 4.5, react: [2000, 5000], gap: [1000, 2500] },
  quick: { cps: 6.5, react: [1000, 2500], gap: [600, 1500] },
};
const READ_CPS = 25;                    // how fast she reads his message, letters per second
const MIN_TYPING = 1200, MAX_TYPING = 30_000, MAX_READING = 8000;

const between = ([a, b]) => a + Math.random() * (b - a);
const jitter = (ms) => ms * (0.85 + Math.random() * 0.3);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * For each of her messages: { wait_ms } before she starts typing it (after his
 * message for the first, after her previous one for the rest) and { typing_ms }.
 * `theirText` = what he wrote, which she reads first.
 */
function typingPlan(messages, { speed = 'normal', theirText = '' } = {}) {
  const s = SPEEDS[speed] || SPEEDS.normal;
  const reading = Math.min(MAX_READING, (String(theirText).length / READ_CPS) * 1000);
  return messages.map((m, i) => ({
    wait_ms: Math.round(i === 0 ? between(s.react) + reading : between(s.gap)),
    typing_ms: Math.round(clamp(jitter((String(m).length / s.cps) * 1000), MIN_TYPING, MAX_TYPING)),
  }));
}

module.exports = { typingPlan, SPEEDS };
