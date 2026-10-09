import type { CSSProperties, ReactNode } from 'react';
import { fonts, palette } from '../../theme/tokens.ts';

interface MonoProps {
  children: ReactNode;
  size?: number;
  faint?: boolean;
  style?: CSSProperties;
}

export function Mono({
  children,
  size = 12,
  faint,
  style,
}: MonoProps) {
  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: size,
        color: faint ? palette.textFaint : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
