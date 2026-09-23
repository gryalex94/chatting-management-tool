// Calendar dates as YYYY-MM-DD in the user's LOCAL time zone. (toISOString() is
// UTC, so around midnight it could land on the wrong day.)
export function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Reports are uploaded the morning after, so yesterday is the natural default.
export const yesterday = () => localDate(-1);
