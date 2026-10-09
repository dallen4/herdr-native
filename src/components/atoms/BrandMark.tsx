import { status } from '../../theme/tokens.ts';

// nieky.info's coral circle + green square, at mark size.
export function BrandMark({ size = 26 }: { size?: number }) {
  const circle = Math.round(size * 0.85);
  const square = Math.round(size * 0.54);
  return (
    <span
      aria-hidden
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size + 4,
        height: size,
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: circle,
          height: circle,
          borderRadius: '50%',
          background: status.error,
        }}
      />
      <span
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: square,
          height: square,
          borderRadius: 3,
          background: status.done,
        }}
      />
    </span>
  );
}
