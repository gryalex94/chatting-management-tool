export default function Sparkline({ data = [], height = 22, tone = 'indigo' }) {
  const max = Math.max(...data, 1);
  return (
    <span className={`spark ${tone}`} style={{ height }}>
      {data.map((v, i) => (
        <i key={i} style={{ height: `${(v / max) * 100}%` }} />
      ))}
    </span>
  );
}
