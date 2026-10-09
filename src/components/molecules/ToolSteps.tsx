import {
  CheckOutlined,
  CloseOutlined,
  LoadingOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useState, type ReactNode } from 'react';
import type { ToolStep } from '../../lib/session/turns.ts';
import {
  fonts,
  palette,
  radius,
  space,
  status as statusColor,
} from '../../theme/tokens.ts';
import { ContextMenu, copyText } from './ContextMenu.tsx';

interface ToolStepsProps {
  steps: ToolStep[];
  onOpenFile?: (path: string) => void;
}

const MAX_PREVIEW = 4000;

type RunStatus = ToolStep['status'];

const runStatus = (steps: ToolStep[]): RunStatus =>
  steps.some((s) => s.status === 'loading')
    ? 'loading'
    : steps.some((s) => s.status === 'error')
      ? 'error'
      : 'success';

function StatusGlyph({ status }: { status: RunStatus }) {
  const style = { fontSize: 10, flex: '0 0 auto' } as const;
  if (status === 'loading')
    return (
      <LoadingOutlined
        style={{ ...style, color: statusColor.working }}
      />
    );
  if (status === 'error')
    return (
      <CloseOutlined style={{ ...style, color: statusColor.error }} />
    );
  return (
    <CheckOutlined style={{ ...style, color: palette.textFaint }} />
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <RightOutlined
      style={{
        fontSize: 9,
        flex: '0 0 auto',
        color: palette.textFaint,
        transition: 'transform 120ms ease',
        transform: open ? 'rotate(90deg)' : undefined,
      }}
    />
  );
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: space.xs,
  width: '100%',
  minWidth: 0,
  minHeight: 28,
  padding: `2px ${space.xs}px`,
  border: 0,
  borderRadius: radius.control,
  background: 'transparent',
  textAlign: 'left',
  font: 'inherit',
  color: palette.textMuted,
} as const;

/** The step's verb and what it touched, on one line. */
function StepLabel({
  step,
  onOpenFile,
}: {
  step: ToolStep;
  onOpenFile?: (path: string) => void;
}) {
  return (
    <span
      className="devhub-ellipsis"
      style={{ flex: 1, fontFamily: fonts.mono, fontSize: 12 }}
    >
      <span style={{ color: palette.textFaint }}>
        {step.name.toLowerCase()}
      </span>{' '}
      {step.file && onOpenFile ? (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenFile(step.file!);
          }}
        >
          {step.summary}
        </a>
      ) : (
        step.summary
      )}
    </span>
  );
}

function StepMenu({
  step,
  onOpenFile,
  children,
}: {
  step: ToolStep;
  onOpenFile?: (path: string) => void;
  children: ReactNode;
}) {
  return (
    <ContextMenu
      items={[
        {
          key: 'copy',
          label:
            step.name === 'Bash' ? 'Copy command' : 'Copy summary',
          onClick: () => void copyText(step.summary),
        },
        ...(step.file && onOpenFile
          ? [
              {
                key: 'open',
                label: 'Open file',
                onClick: () => onOpenFile(step.file!),
              },
              {
                key: 'copy-path',
                label: 'Copy path',
                onClick: () => void copyText(step.file!),
              },
            ]
          : []),
        ...(step.result
          ? [
              {
                key: 'copy-result',
                label: 'Copy output',
                onClick: () => void copyText(step.result!),
              },
            ]
          : []),
      ]}
    >
      {children}
    </ContextMenu>
  );
}

function Step({
  step,
  onOpenFile,
}: {
  step: ToolStep;
  onOpenFile?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const expandable = !!step.result;
  return (
    <div style={{ minWidth: 0 }}>
      <StepMenu step={step} onOpenFile={onOpenFile}>
        <button
          type="button"
          className="devhub-step"
          aria-expanded={expandable ? open : undefined}
          disabled={!expandable}
          onClick={() => setOpen((o) => !o)}
          style={{
            ...rowStyle,
            cursor: expandable ? 'pointer' : 'default',
          }}
        >
          <StatusGlyph status={step.status} />
          <StepLabel step={step} onOpenFile={onOpenFile} />
          {expandable && <Chevron open={open} />}
        </button>
      </StepMenu>
      {open && step.result && (
        <pre
          style={{
            margin: `${space.xxs}px 0 ${space.xs}px`,
            maxHeight: 320,
            overflow: 'auto',
            padding: space.sm,
            borderRadius: radius.control,
            background: palette.surface,
            fontFamily: fonts.mono,
            fontSize: 11.5,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            color: palette.textMuted,
          }}
        >
          {step.result.length > MAX_PREVIEW
            ? `${step.result.slice(0, MAX_PREVIEW)}\n…`
            : step.result}
        </pre>
      )}
    </div>
  );
}

// A run of tool calls. One call shows as a single row; several fold into
// one line ("6 steps", with the latest step as a preview) that expands
// to the list. Each row expands to its output. Kept quiet and one line
// tall so the agent's prose carries the turn.
export function ToolSteps({ steps, onOpenFile }: ToolStepsProps) {
  const [open, setOpen] = useState(false);
  if (steps.length === 1) {
    return <Step step={steps[0]} onOpenFile={onOpenFile} />;
  }
  const status = runStatus(steps);
  const latest = steps[steps.length - 1];
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: radius.card,
        border: `1px solid ${open ? palette.border : 'transparent'}`,
        background: open ? palette.surface : 'transparent',
        transition: 'background 120ms ease',
      }}
    >
      <button
        type="button"
        className="devhub-step"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ ...rowStyle, cursor: 'pointer' }}
      >
        <StatusGlyph status={status} />
        <span
          style={{
            flex: '0 0 auto',
            fontSize: 12.5,
            fontWeight: 550,
            color: palette.textMuted,
          }}
        >
          {steps.length} steps
        </span>
        {!open && (
          <span
            className="devhub-ellipsis"
            style={{
              flex: 1,
              fontFamily: fonts.mono,
              fontSize: 12,
              color: palette.textFaint,
            }}
          >
            {latest.name.toLowerCase()} {latest.summary}
          </span>
        )}
        <span style={{ flex: open ? 1 : '0 0 auto' }} />
        <Chevron open={open} />
      </button>
      {open && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: `0 ${space.xxs}px ${space.xxs}px`,
          }}
        >
          {steps.map((step) => (
            <Step key={step.id} step={step} onOpenFile={onOpenFile} />
          ))}
        </div>
      )}
    </div>
  );
}
