// Why a manager dismissed a task. The codes are the calibration signal: the AI
// reviews see recent rejections (evalShared.loadCorrections) and the task builder
// stops re-raising what was dismissed (taskGenerator). Mirrors DISMISS_REASONS in
// client/src/utils/taskMeta.js — keep the two in step.
const DISMISS_LABEL = {
  allowed: "It's fine / allowed",
  already_handled: 'Already handled / sent',
  ppv_sent: 'A PPV was sent',
  misread: 'AI misread it',
  needs_context: 'Needs the full dialogue',
  too_minor: 'Too minor to action',
  fan_fault: "Fan's behaviour, not the chatter",
  duplicate: 'Duplicate task',
  other: 'Other',
};
const DISMISS_CODES = Object.keys(DISMISS_LABEL);

// The finding itself was wrong or not worth raising (vs. real but already dealt
// with, or a duplicate) — these teach the AI what not to flag.
const WRONG_FINDING = new Set(['allowed', 'ppv_sent', 'misread', 'too_minor', 'fan_fault']);

module.exports = { DISMISS_LABEL, DISMISS_CODES, WRONG_FINDING };
