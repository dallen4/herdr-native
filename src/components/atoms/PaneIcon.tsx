import type { Pane } from '@devhub/shared/hub';

/** 🤖 for an agent, 💻 for a shell. */
export function PaneIcon({
  pane,
  size = 15,
}: {
  pane: Pick<Pane, 'kind'>;
  size?: number;
}) {
  return (
    <span
      role="img"
      aria-label={pane.kind === 'agent' ? 'agent' : 'shell'}
      style={{
        flex: '0 0 auto',
        width: size + 6,
        textAlign: 'center',
        fontSize: size,
        lineHeight: 1,
      }}
    >
      {pane.kind === 'agent' ? '🤖' : '💻'}
    </span>
  );
}
