import { Tooltip } from 'antd';
import { untilReset, useClaudeUsage } from '../../hooks/use-usage.ts';
import {
  palette,
  radius,
  space,
  status,
} from '../../theme/tokens.ts';
import { Mono } from '../atoms/Mono.tsx';

const levelColor = (left: number) =>
  left <= 10
    ? status.error
    : left <= 30
      ? status.needsYou
      : status.done;

// What's left of the Claude 5-hour session limit and when it resets,
// with the weekly limit in the tooltip.
export function UsageMeter() {
  const usage = useClaudeUsage();
  const session = usage?.session;
  if (!session) return null;
  const left = 100 - session.usedPercent;
  const week = usage.week;

  return (
    <Tooltip
      title={
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div>
            Session: {left}% left, resets in{' '}
            {untilReset(session.resetsAt)}
          </div>
          {week && (
            <div>
              Week: {100 - week.usedPercent}% left, resets in{' '}
              {untilReset(week.resetsAt)}
            </div>
          )}
          {usage.plan && (
            <div style={{ opacity: 0.7 }}>Claude {usage.plan}</div>
          )}
        </div>
      }
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.xs,
          height: 32,
          padding: `0 ${space.sm}px`,
          borderRadius: radius.pill,
          background: palette.raised,
          whiteSpace: 'nowrap',
          cursor: 'default',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'relative',
            width: 36,
            height: 5,
            borderRadius: 3,
            background: palette.borderStrong,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 0,
              width: `${left}%`,
              background: levelColor(left),
            }}
          />
        </span>
        <Mono size={11.5}>
          {left}% left · {untilReset(session.resetsAt)}
        </Mono>
      </span>
    </Tooltip>
  );
}
