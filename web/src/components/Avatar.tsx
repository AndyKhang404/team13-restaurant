interface AvatarProps {
  url?: string | null;
  name?: string | null;
  size?: number;
  cls?: string;
}

/**
 * Chef avatar (Facebook-default style). When a real photo URL exists it is
 * always preferred; otherwise a neutral person glyph is shown at the same box
 * size and circular shape.
 */
export function Avatar({ url, name, size = 64, cls }: AvatarProps) {
  const extra = cls ? ` ${cls}` : '';
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? 'Ảnh đại diện'}
        loading="lazy"
        className={`avatar-img${extra}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`avatar-fb${extra}`}
      role="img"
      aria-label={name ? `Ảnh đại diện mặc định của ${name}` : 'Ảnh đại diện mặc định'}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 12.2c-2.7 0-5-2.2-5-5s2.3-5 5-5 5 2.2 5 5-2.3 5-5 5zm0 2.1c3.6 0 7.3 1.8 7.3 5.4v1.1H4.7v-1.1c0-3.6 3.7-5.4 7.3-5.4z" />
      </svg>
    </span>
  );
}
