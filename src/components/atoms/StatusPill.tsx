import { Button } from 'antd';
import type { ReactNode } from 'react';
import { palette, status } from '../../theme/tokens.ts';

interface StatusPillProps {
  children: ReactNode;
  /** Filled pollen, for the one thing that needs the user. */
  urgent?: boolean;
  onClick?: () => void;
}

// nieky.info's nav pill, used for top-bar status filters.
export function StatusPill({
  children,
  urgent,
  onClick,
}: StatusPillProps) {
  return (
    <Button
      shape="round"
      type="text"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingInline: 14,
        background: urgent ? status.needsYou : palette.raised,
        color: urgent ? '#241A00' : palette.text,
      }}
    >
      {children}
    </Button>
  );
}
