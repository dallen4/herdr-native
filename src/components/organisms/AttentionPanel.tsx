import { Flex } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useHub } from '../../contexts/HubContext.tsx';
import { panePath } from '../../lib/routes.ts';
import type { PlanItem } from '../../lib/session/turns.ts';
import {
  palette,
  radius,
  space,
  status,
} from '../../theme/tokens.ts';
import { Display } from '../atoms/Display.tsx';
import { StatusDot } from '../atoms/StatusDot.tsx';

const ago = (ts: number) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  return m === 0
    ? 'now'
    : m < 60
      ? `${m}m`
      : `${Math.floor(m / 60)}h`;
};

function PlanList({ steps }: { steps: PlanItem[] }) {
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: space.sm,
        fontSize: 12.5,
      }}
    >
      {steps.map((step, i) => (
        <li
          key={`${i}-${step.label}`}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: space.sm,
            lineHeight: 1.5,
            color:
              step.state === 'done'
                ? palette.textFaint
                : step.state === 'active'
                  ? palette.text
                  : palette.textMuted,
            fontWeight: step.state === 'active' ? 600 : undefined,
          }}
        >
          <span
            style={{
              flex: '0 0 auto',
              transform: 'translateY(-1px)',
            }}
          >
            {step.state === 'todo' ? (
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  border: `1.5px solid ${status.idle}`,
                }}
              />
            ) : (
              <StatusDot
                status={step.state === 'done' ? 'done' : 'needsYou'}
              />
            )}
          </span>
          <span
            style={{
              textDecoration:
                step.state === 'done' ? 'line-through' : undefined,
            }}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AttentionPanel({ plan }: { plan: PlanItem[] }) {
  const { attention } = useHub();
  const navigate = useNavigate();

  return (
    <aside
      aria-label="Activity"
      style={{
        height: '100%',
        overflow: 'auto',
        boxSizing: 'border-box',
        padding: space.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: space.xl,
      }}
    >
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: space.sm,
        }}
      >
        <Display>Needs you</Display>
        {attention.length === 0 && (
          <span style={{ color: palette.textFaint, fontSize: 12.5 }}>
            Nothing waiting on you.
          </span>
        )}
        {attention.map(({ pane, workspace }) => (
          <button
            key={`${pane.machineId}/${pane.paneId}`}
            type="button"
            onClick={() => navigate(panePath(pane))}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: space.sm,
              textAlign: 'left',
              cursor: 'pointer',
              padding: space.md,
              borderRadius: radius.panel,
              background: palette.card,
              border: `1px solid ${palette.borderStrong}`,
              color: palette.text,
              font: 'inherit',
            }}
          >
            <Flex
              vertical
              gap={space.xxs}
              style={{ flex: 1, minWidth: 0 }}
            >
              <Display size={14}>{pane.title}</Display>
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: palette.textMuted,
                  wordBreak: 'break-word',
                }}
              >
                {pane.ask ?? 'Waiting for input'}
              </span>
              <span
                style={{ fontSize: 11, color: palette.textFaint }}
              >
                {workspace.name} · {ago(pane.updatedAt)}
              </span>
            </Flex>
            <span style={{ marginTop: 5 }}>
              <StatusDot status="needsYou" />
            </span>
          </button>
        ))}
      </section>

      {plan.length > 0 && (
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: space.sm,
          }}
        >
          <Display>Plan</Display>
          <PlanList steps={plan} />
        </section>
      )}
    </aside>
  );
}
