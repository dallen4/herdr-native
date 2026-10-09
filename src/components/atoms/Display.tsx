import type { CSSProperties, ReactNode } from 'react';
import { fonts } from '../../theme/tokens.ts';

interface DisplayProps {
  children: ReactNode;
  size?: number;
  weight?: 600 | 700;
  style?: CSSProperties;
}

// Clash Display headline text (nieky.info's display face).
export function Display({
  children,
  size = 15,
  weight = 600,
  style,
}: DisplayProps) {
  return (
    <span
      style={{
        fontFamily: fonts.display,
        fontWeight: weight,
        fontSize: size,
        letterSpacing: size >= 20 ? '-0.02em' : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
