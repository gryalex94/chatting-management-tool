export default function Chip({ tone = 'default', children, style = {} }) {
  return <span className={`chip ${tone}`} style={style}>{children}</span>;
}
