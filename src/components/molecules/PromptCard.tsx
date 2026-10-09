import type { PaneRef, PromptInfo } from '@devhub/shared/hub';
import { App, Button, Flex } from 'antd';
import { useState } from 'react';
import { useConnection } from '../../contexts/HubContext.tsx';
import {
  palette,
  radius,
  space,
  status,
} from '../../theme/tokens.ts';
import { Display } from '../atoms/Display.tsx';
import { Mono } from '../atoms/Mono.tsx';
import { StatusDot } from '../atoms/StatusDot.tsx';

const KIND_LABEL: Record<PromptInfo['kind'], string> = {
  approval: 'Approval needed',
  question: 'Claude is asking',
  plan: 'Plan ready',
  confirm: 'Confirm',
};

// The AG-UI interrupt, rendered: an agent's menu as buttons. The bridge
// re-reads the screen and refuses the answer if the menu changed.
export function PromptCard({
  pane,
  prompt,
}: {
  pane: PaneRef;
  prompt: PromptInfo;
}) {
  const connection = useConnection();
  const { message } = App.useApp();
  const [busy, setBusy] = useState<number | null>(null);
  const [command, ...rest] = prompt.body.split('\n');

  const answer = async (index: number) => {
    setBusy(index);
    try {
      await connection.request('prompt.answer', {
        paneId: pane.paneId,
        hash: prompt.hash,
        index,
      });
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Flex
      vertical
      gap={space.md}
      style={{
        background: palette.card,
        border: `1px solid ${palette.borderStrong}`,
        borderRadius: radius.panel,
        padding: space.lg,
      }}
    >
      <Flex align="center" gap={space.sm}>
        <Display size={16}>{KIND_LABEL[prompt.kind]}</Display>
        <StatusDot status="needsYou" />
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11.5,
            color: palette.textFaint,
          }}
        >
          {prompt.title}
        </span>
      </Flex>
      {prompt.kind === 'approval' && command ? (
        <>
          <Mono
            size={12.5}
            style={{
              display: 'block',
              whiteSpace: 'pre-wrap',
              background: palette.surface,
              borderLeft: `2px solid ${status.needsYou}`,
              borderRadius: radius.control,
              padding: `${space.sm}px ${space.md}px`,
            }}
          >
            {command}
          </Mono>
          {rest.length > 0 && (
            <span
              style={{
                color: palette.textMuted,
                whiteSpace: 'pre-wrap',
              }}
            >
              {rest.join('\n')}
            </span>
          )}
        </>
      ) : (
        prompt.body && (
          <span
            style={{
              color: palette.textMuted,
              whiteSpace: 'pre-wrap',
            }}
          >
            {prompt.body}
          </span>
        )
      )}
      <Flex gap={space.xs} wrap>
        {prompt.options.map((o, i) => (
          <Button
            key={o.index}
            type={i === 0 ? 'primary' : undefined}
            color={i === 1 ? 'primary' : undefined}
            variant={i === 1 ? 'filled' : undefined}
            loading={busy === o.index}
            disabled={busy !== null && busy !== o.index}
            onClick={() => void answer(o.index)}
            style={{
              height: 'auto',
              minHeight: 32,
              whiteSpace: 'normal',
            }}
          >
            {o.label}
          </Button>
        ))}
      </Flex>
    </Flex>
  );
}
