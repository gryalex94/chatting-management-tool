export default function StatusDot({ status }) {
  const s = status === 'new_monitoring' ? 'monitor' : status;
  return <span className={`sdot ${s}`} />;
}
