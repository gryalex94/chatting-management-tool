import { initials, avatarColor } from '../../utils/helpers';

export default function Avatar({ name, size = 28, style = {} }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 600, color: 'var(--fg-0)',
        background: avatarColor(name), border: '1px solid var(--border)',
        flexShrink: 0, ...style,
      }}
    >
      {initials(name)}
    </span>
  );
}
