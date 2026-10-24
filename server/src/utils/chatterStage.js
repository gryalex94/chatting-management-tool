/**
 * A chatter's experience stage, which decides how strict the daily review's tasks are for them
 * (utils/taskGenerator.js keepByTenure): New sees every finding, Learning medium and up,
 * Experienced the serious ones (plus the always-on kinds).
 *  - by default it follows the start date: New for the first 7 days, Learning to day 21, then Experienced
 *  - a manager can set it by hand (stage_override); that holds until cleared
 */
const STAGES = ['new', 'learning', 'experienced'];
const NEW_DAYS = 7, LEARNING_DAYS = 21;
const DAY = 86400000;

function autoStage(startedOn, onDate) {
  if (!startedOn) return 'experienced';                         // no start date known: treat as experienced
  const days = Math.round((Date.parse(`${onDate}T00:00:00Z`) - Date.parse(`${String(startedOn).slice(0, 10)}T00:00:00Z`)) / DAY);
  if (days < NEW_DAYS) return 'new';
  if (days < LEARNING_DAYS) return 'learning';
  return 'experienced';
}

/** { stage, auto, override, next: { stage, on } | null } for a chatter row (started_on, stage_override, created_at). */
function stageOf(c, onDate) {
  const started = c.started_on || (c.created_at ? String(c.created_at).slice(0, 10) : null);
  const auto = autoStage(started, onDate);
  const override = STAGES.includes(c.stage_override) ? c.stage_override : null;
  let next = null;
  if (!override && started && auto !== 'experienced') {
    const at = (n) => new Date(Date.parse(`${String(started).slice(0, 10)}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
    next = auto === 'new' ? { stage: 'learning', on: at(NEW_DAYS) } : { stage: 'experienced', on: at(LEARNING_DAYS) };
  }
  return { stage: override || auto, auto, override, started_on: started, next };
}

module.exports = { STAGES, stageOf, autoStage };
