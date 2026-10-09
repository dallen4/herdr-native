import {
  status as statusColors,
  type Status,
} from '../../theme/tokens.ts';

interface StatusDotProps {
  status?: Status;
  size?: number;
}

export function StatusDot({
  status = 'idle',
  size = 8,
}: StatusDotProps) {
  return (
    <span
      aria-label={status}
      style={{
        display: 'inline-block',
        flex: '0 0 auto',
        width: size,
        height: size,
        borderRadius: '50%',
        background: statusColors[status],
      }}
    />
  );
}
