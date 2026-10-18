// Number formats shared by the Fanvue screens.
export const num = (n) => (n == null ? '·' : Math.round(n).toLocaleString());
// Whole dollars, or dollars and cents below $10 (an AI day can cost cents).
export const usd = (cents) => {
  const d = Math.round(cents) / 100;
  return `$${d.toLocaleString(undefined, d < 10 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;
};
