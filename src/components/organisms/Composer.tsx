import { Sender, Suggestion } from '@ant-design/x';
import type { SenderRef } from '@ant-design/x/es/sender';
import type { SuggestionItem } from '@ant-design/x/es/suggestion';
import {
  paneKey,
  type AgentPane,
  type SlashCommand,
} from '@devhub/shared/hub';
import { App, Button, Flex } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useHub } from '../../contexts/HubContext.tsx';
import {
  dequeue,
  enqueue,
  loadDraft,
  saveDraft,
  useQueue,
} from '../../lib/composer.ts';
import { isTouchDevice } from '../../lib/native.ts';
import { palette, radius, space } from '../../theme/tokens.ts';
import { Mono } from '../atoms/Mono.tsx';

const MENTION = /(^|\s)@(\S*)$/;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function Composer({ pane }: { pane: AgentPane }) {
  const connection = useConnection();
  const { status } = useHub();
  const { message } = App.useApp();
  const key = paneKey(pane);
  const queue = useQueue(key);
  const [draft, setDraftState] = useState(() => loadDraft(key));
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const sender = useRef<SenderRef>(null);
  // On a phone, Return is a newline and the send button sends (there's
  // no Shift to reach for); and nothing grabs focus, since focus means
  // a keyboard covering half the screen.
  const touch = useMemo(isTouchDevice, []);

  // On desktop, a pane you switch to is ready to type into (once the
  // connection is up; a disabled field can't take focus).
  const online = status === 'online';
  useEffect(() => {
    if (touch || !online) return;
    const timer = setTimeout(
      () => sender.current?.focus({ cursor: 'end' }),
      50,
    );
    return () => clearTimeout(timer);
  }, [key, touch, online]);

  const setDraft = (text: string) => {
    setDraftState(text);
    saveDraft(key, text);
    setDismissed(false);
  };

  useEffect(() => {
    connection
      .request('commands.list', { paneId: pane.paneId })
      .then(setCommands)
      .catch(() => setCommands([]));
  }, [connection, pane.paneId]);

  const mention = draft.match(MENTION)?.[2];
  useEffect(() => {
    if (mention === undefined) return;
    const timer = setTimeout(() => {
      connection
        .request('files.search', {
          paneId: pane.paneId,
          query: mention,
        })
        .then(setFiles)
        .catch(() => setFiles([]));
    }, 120);
    return () => clearTimeout(timer);
  }, [connection, pane.paneId, mention]);

  const items: SuggestionItem[] = useMemo(() => {
    if (/^\/\S*$/.test(draft)) {
      return commands
        .filter((c) => c.name.startsWith(draft))
        .slice(0, 12)
        .map((c) => ({
          value: c.name,
          label: (
            <Flex gap={space.sm}>
              <Mono>{c.name}</Mono>
              <span style={{ color: palette.textFaint }}>
                {c.description}
              </span>
            </Flex>
          ),
        }));
    }
    if (mention !== undefined) {
      return files.map((f) => ({
        value: `@${f}`,
        label: <Mono>{f}</Mono>,
      }));
    }
    return [];
  }, [draft, commands, files, mention]);

  const open = items.length > 0 && !dismissed;

  const select = (value: string) => {
    if (value.startsWith('@')) {
      setDraft(draft.replace(MENTION, `$1${value} `));
    } else {
      setDraft(`${value} `);
    }
  };

  const send = async (text: string) => {
    await connection.request('pane.send', {
      paneId: pane.paneId,
      text,
    });
  };

  const submit = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    if (pane.status === 'working') {
      enqueue(key, text);
      setDraft('');
      return;
    }
    setSending(true);
    try {
      await send(text);
      setDraft('');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendQueued = async (id: string, text: string) => {
    try {
      await send(text);
      dequeue(key, id);
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const attach = async (list: FileList) => {
    for (const file of Array.from(list)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const { path } = await connection.request('fs.saveImage', {
          paneId: pane.paneId,
          name: file.name || 'pasted.png',
          dataUrl: await readAsDataUrl(file),
        });
        setDraft(
          `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}${path} `,
        );
      } catch (error) {
        message.error((error as Error).message);
      }
    }
  };

  return (
    <Flex vertical gap={space.xs}>
      {queue.length > 0 && (
        <Flex
          vertical
          gap={space.xxs}
          style={{
            padding: space.sm,
            borderRadius: radius.card,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
          }}
        >
          <span style={{ fontSize: 11.5, color: palette.textFaint }}>
            Queued while Claude works. Nothing sends until you say so.
          </span>
          {queue.map((q) => (
            <Flex key={q.id} align="center" gap={space.sm}>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {q.text}
              </span>
              <Button
                size="small"
                color="primary"
                variant="filled"
                onClick={() => void sendQueued(q.id, q.text)}
              >
                Send now
              </Button>
              <Button
                size="small"
                type="text"
                onClick={() => dequeue(key, q.id)}
              >
                Remove
              </Button>
            </Flex>
          ))}
        </Flex>
      )}
      <Suggestion
        items={items}
        open={open}
        onOpenChange={(next) => !next && setDismissed(true)}
        onSelect={select}
        block
      >
        {({ onKeyDown }) => (
          <Sender
            ref={sender}
            submitType={touch ? 'shiftEnter' : 'enter'}
            value={draft}
            onChange={setDraft}
            onSubmit={(text) => void submit(text)}
            onKeyDown={(e) => {
              if (
                open &&
                [
                  'Enter',
                  'ArrowUp',
                  'ArrowDown',
                  'Escape',
                  'Tab',
                ].includes(e.key)
              ) {
                onKeyDown(e);
                if (e.key === 'Escape') setDismissed(true);
                return false;
              }
              // Suggestion wraps us in an antd Cascader, whose keydown
              // handler cancels Space and Enter (it treats them as
              // "open the menu"): spaces vanish and Shift+Enter loses
              // its newline. Keep them from reaching it.
              if (e.key === ' ' || e.key === 'Enter') {
                e.stopPropagation();
              }
            }}
            onPasteFile={(list) => void attach(list)}
            loading={sending}
            disabled={status !== 'online'}
            placeholder={
              pane.status === 'working'
                ? touch
                  ? 'Queue a message…'
                  : 'Claude is working. Messages queue until you send them.'
                : touch
                  ? 'Message Claude'
                  : 'Reply to Claude, / for commands, @ for files'
            }
          />
        )}
      </Suggestion>
    </Flex>
  );
}
