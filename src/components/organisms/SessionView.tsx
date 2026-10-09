import {
  ArrowDownOutlined,
  BranchesOutlined,
  FolderOpenOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import {
  paneKey,
  type AgentPane,
  type Pane,
  type Workspace,
} from '@devhub/shared/hub';
import {
  App,
  Button,
  Dropdown,
  Flex,
  Segmented,
  Spin,
  Tooltip,
} from 'antd';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useConnection, useHub } from '../../contexts/HubContext.tsx';
import {
  useUi,
  type SessionMode,
} from '../../contexts/UiContext.tsx';
import { useIsMobile } from '../../hooks/use-mobile.ts';
import type { SessionState } from '../../hooks/use-session.ts';
import { isTouchDevice } from '../../lib/native.ts';
import { toTurns, type Turn } from '../../lib/session/turns.ts';
import { dismissKeyboard } from '../../lib/viewport.ts';
import { palette, space } from '../../theme/tokens.ts';
import { Display } from '../atoms/Display.tsx';
import { Mono } from '../atoms/Mono.tsx';
import { StatusDot } from '../atoms/StatusDot.tsx';
import { ContextMenu, copyText } from '../molecules/ContextMenu.tsx';
import { Markdown } from '../molecules/Markdown.tsx';
import { PromptCard } from '../molecules/PromptCard.tsx';
import { Reasoning } from '../molecules/Reasoning.tsx';
import { ToolSteps } from '../molecules/ToolSteps.tsx';
import { XTerm } from '../molecules/XTerm.tsx';
import { BrowserView } from './BrowserView.tsx';
import { Composer } from './Composer.tsx';

type View = SessionMode;

const COLUMN = 800;

const tokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : String(n);

function TurnBlocks({
  turn,
  onOpenFile,
}: {
  turn: Turn;
  onOpenFile: (path: string) => void;
}) {
  return (
    <Flex vertical gap={space.sm} style={{ minWidth: 0 }}>
      {turn.blocks.map((block) =>
        block.kind === 'text' ? (
          <ContextMenu
            key={block.id}
            items={[
              {
                key: 'copy',
                label: 'Copy as Markdown',
                onClick: () => void copyText(block.text),
              },
            ]}
          >
            <Markdown text={block.text} />
          </ContextMenu>
        ) : block.kind === 'reasoning' ? (
          <Reasoning key={block.id} text={block.text} />
        ) : (
          <ToolSteps
            key={block.id}
            steps={block.steps}
            onOpenFile={onOpenFile}
          />
        ),
      )}
    </Flex>
  );
}

const STICK_PX = 80;

function UserMessage({ text }: { text: string }) {
  const isMobile = useIsMobile();
  return (
    <Flex justify="flex-end">
      <ContextMenu
        items={[
          {
            key: 'copy',
            label: 'Copy',
            onClick: () => void copyText(text),
          },
        ]}
      >
        <div
          style={{
            maxWidth: isMobile ? '88%' : '78%',
            padding: `${space.xs + 2}px ${space.md - 2}px`,
            borderRadius: 18,
            borderBottomRightRadius: 6,
            background: palette.raised,
            border: `1px solid ${palette.borderStrong}`,
            color: palette.text,
            fontSize: isMobile ? 15 : 15.5,
            fontWeight: 450,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {text}
        </div>
      </ContextMenu>
    </Flex>
  );
}

/** Shown under the last turn while Claude is working. */
function Working({ activity }: { activity: string }) {
  return (
    <Flex
      align="center"
      gap={space.xs}
      style={{ color: palette.textFaint, fontSize: 13 }}
    >
      <span className="devhub-working" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className="devhub-ellipsis">{activity || 'Working'}</span>
    </Flex>
  );
}

function Transcript({
  pane,
  session,
}: {
  pane: AgentPane;
  session: SessionState;
}) {
  const { open } = useUi();
  const isMobile = useIsMobile();
  const gutter = isMobile ? space.sm : space.xl;
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // Start at the bottom and stay there while the user is there; reading
  // further up isn't interrupted by new messages.
  const stuck = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const turns = useMemo(
    () => toTurns(session.messages),
    [session.messages],
  );

  const onOpenFile = useCallback(
    (path: string) => {
      if (!pane.cwd) return;
      const full = path.startsWith('/')
        ? path
        : `${pane.cwd}/${path}`;
      open({ kind: 'files', cwd: pane.cwd, path: full });
    },
    [open, pane.cwd],
  );

  const toBottom = () => {
    const el = scroller.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  };

  const jump = () => {
    const el = scroller.current;
    if (!el) return;
    stuck.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  useLayoutEffect(toBottom, [
    turns,
    session.prompt,
    session.loaded,
    pane.status,
  ]);

  // Markdown and code blocks settle after first paint; keep pinned.
  useEffect(() => {
    const el = content.current;
    if (!el) return;
    const observer = new ResizeObserver(toBottom);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const working = pane.status === 'working';

  return (
    <Flex vertical style={{ height: '100%', minHeight: 0 }}>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            const bottom =
              el.scrollHeight - el.scrollTop - el.clientHeight <
              STICK_PX;
            stuck.current = bottom;
            if (bottom !== atBottom) setAtBottom(bottom);
          }}
          // tapping the conversation puts the keyboard away
          onPointerDown={() => isTouchDevice() && dismissKeyboard()}
          style={{
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: `${isMobile ? space.md : space.xl}px ${gutter}px 0`,
          }}
        >
          <div
            ref={content}
            style={{
              maxWidth: COLUMN,
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? space.lg : space.xl,
              paddingBottom: space.md,
            }}
          >
            {!session.loaded ? (
              <Spin style={{ marginTop: space.xxl }} />
            ) : turns.length === 0 ? (
              <span
                style={{
                  color: palette.textFaint,
                  marginTop: space.xl,
                  textAlign: 'center',
                }}
              >
                No conversation yet. Say hi to Claude below.
              </span>
            ) : (
              turns.map((turn) => (
                <Flex
                  key={turn.id}
                  vertical
                  gap={space.md}
                  style={{ minWidth: 0 }}
                >
                  {turn.prompt !== null && (
                    <UserMessage text={turn.prompt} />
                  )}
                  {turn.blocks.length > 0 && (
                    <TurnBlocks turn={turn} onOpenFile={onOpenFile} />
                  )}
                </Flex>
              ))
            )}
            {session.loaded && working && (
              <Working activity={pane.activity} />
            )}
            {session.prompt && pane.status === 'needsYou' && (
              <PromptCard pane={pane} prompt={session.prompt} />
            )}
          </div>
        </div>
        {!atBottom && (
          <Button
            shape="circle"
            aria-label="Jump to latest"
            icon={<ArrowDownOutlined />}
            onClick={jump}
            style={{
              position: 'absolute',
              left: '50%',
              bottom: space.sm,
              transform: 'translateX(-50%)',
              width: 36,
              height: 36,
              background: palette.raised,
              border: `1px solid ${palette.borderEmphasis}`,
              boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
            }}
          />
        )}
      </div>
      <div
        style={{
          padding: `${space.xs}px ${gutter}px ${isMobile ? space.xs : space.lg}px`,
        }}
      >
        <div style={{ maxWidth: COLUMN, margin: '0 auto' }}>
          <Composer pane={pane} />
        </div>
      </div>
    </Flex>
  );
}

interface SessionViewProps {
  pane: Pane;
  workspace: Workspace;
  session: SessionState;
}

export function SessionView({
  pane,
  workspace,
  session,
}: SessionViewProps) {
  const connection = useConnection();
  const { open, viewOf, setView } = useUi();
  const { snapshot } = useHub();
  const { message } = App.useApp();
  const key = paneKey(pane);
  const isMobile = useIsMobile();
  const stored = viewOf(key);
  // No room for a split on a phone: it reads as chat there.
  const view =
    isMobile && stored.mode === 'Split' ? 'Chat' : stored.mode;
  const right = stored.right;
  const cwd = pane.cwd ?? workspace.cwd;
  // What can sit beside the chat: its terminal, or a browser tab kept
  // with this workspace (this pane's own tabs first).
  const tabsHere = snapshot.browserTabs
    .filter((t) => t.anchor?.workspaceId === workspace.id)
    .sort(
      (a, b) =>
        Number(b.anchor?.paneId === pane.paneId) -
        Number(a.anchor?.paneId === pane.paneId),
    );
  const rightTab = tabsHere.find((t) => t.id === right);

  const meta = session.meta;
  const details = [
    workspace.name,
    pane.paneId,
    ...(pane.kind === 'agent'
      ? meta
        ? [
            meta.model?.replace(/^claude-/, ''),
            `${meta.turns} turns`,
            `${tokens(meta.inputTokens + meta.outputTokens)} tok`,
          ]
        : [pane.activity]
      : ['shell']),
  ].filter(Boolean);

  const interrupt = () =>
    connection
      .request('pane.keys', { paneId: pane.paneId, keys: ['esc'] })
      .catch((e: Error) => message.error(e.message));

  const terminal = <XTerm paneId={pane.paneId} />;
  let body = terminal;
  if (pane.kind === 'agent') {
    const chat = <Transcript pane={pane} session={session} />;
    body =
      view === 'Chat' ? (
        chat
      ) : view === 'Terminal' ? (
        terminal
      ) : (
        <Flex style={{ height: '100%' }}>
          <div style={{ flex: 1, minWidth: 0 }}>{chat}</div>
          <Flex
            vertical
            style={{
              flex: 1,
              minWidth: 0,
              borderLeft: `1px solid ${palette.border}`,
            }}
          >
            {tabsHere.length > 0 && (
              <div
                className="no-scrollbar"
                style={{
                  padding: `${space.xs}px ${space.sm}px`,
                  overflowX: 'auto',
                  borderBottom: `1px solid ${palette.border}`,
                }}
              >
                <Segmented
                  size="small"
                  shape="round"
                  value={rightTab ? rightTab.id : 'terminal'}
                  onChange={(v) => setView(key, { right: String(v) })}
                  options={[
                    { value: 'terminal', label: '💻 Terminal' },
                    ...tabsHere.map((t) => ({
                      value: t.id,
                      label: (
                        <span
                          className="devhub-ellipsis"
                          style={{
                            display: 'inline-block',
                            maxWidth: 180,
                          }}
                        >
                          🌐 {t.title}
                        </span>
                      ),
                    })),
                  ]}
                />
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0 }}>
              {rightTab ? (
                <BrowserView
                  key={rightTab.id}
                  tab={rightTab}
                  compact
                />
              ) : (
                terminal
              )}
            </div>
          </Flex>
        </Flex>
      );
  }

  if (isMobile) {
    return (
      <Flex vertical style={{ height: '100%', minHeight: 0 }}>
        <Flex
          align="center"
          gap={space.xs}
          style={{
            padding: `${space.sm}px ${space.sm}px ${space.xs}px ${space.md}px`,
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          <Flex vertical style={{ flex: 1, minWidth: 0 }}>
            <Flex
              align="center"
              gap={space.xs}
              style={{ minWidth: 0 }}
            >
              <Display
                size={19}
                weight={700}
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {pane.title}
              </Display>
              {pane.kind === 'agent' && (
                <StatusDot status={pane.status} size={8} />
              )}
            </Flex>
            <Mono
              size={10.5}
              faint
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {details.join(' · ')}
            </Mono>
          </Flex>
          {pane.kind === 'agent' && (
            <Segmented<View>
              size="small"
              shape="round"
              options={['Chat', 'Terminal']}
              value={view}
              onChange={(mode) => setView(key, { mode })}
            />
          )}
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                ...(cwd
                  ? [
                      { key: 'changes', label: 'Review changes' },
                      { key: 'files', label: 'Browse files' },
                    ]
                  : []),
                ...(pane.kind === 'agent'
                  ? [{ key: 'interrupt', label: 'Interrupt (Esc)' }]
                  : []),
              ],
              onClick: ({ key: action }) => {
                if (action === 'changes' && cwd)
                  open({ kind: 'changes', cwd });
                if (action === 'files' && cwd)
                  open({ kind: 'files', cwd });
                if (action === 'interrupt') void interrupt();
              },
            }}
          >
            <Button
              type="text"
              aria-label="More"
              icon={<MoreOutlined />}
              style={{ width: 44, height: 44 }}
            />
          </Dropdown>
        </Flex>
        <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
      </Flex>
    );
  }

  return (
    <Flex vertical style={{ height: '100%', minHeight: 0 }}>
      <Flex
        align="center"
        gap={space.md}
        style={{
          padding: `${space.md}px ${space.lg}px ${space.sm}px`,
        }}
      >
        <Flex vertical gap={space.xxs} style={{ minWidth: 0 }}>
          <Flex align="center" gap={space.sm}>
            <Display
              size={27}
              weight={700}
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {pane.title}
            </Display>
            {pane.kind === 'agent' && (
              <StatusDot status={pane.status} size={9} />
            )}
          </Flex>
          <Mono size={11} faint>
            {details.join(' · ')}
          </Mono>
        </Flex>
        <Flex
          align="center"
          gap={space.xs}
          style={{ marginLeft: 'auto' }}
        >
          {cwd && (
            <>
              <Tooltip title="Changes">
                <Button
                  type="text"
                  aria-label="Changes"
                  icon={<BranchesOutlined />}
                  onClick={() => open({ kind: 'changes', cwd })}
                />
              </Tooltip>
              <Tooltip title="Files">
                <Button
                  type="text"
                  aria-label="Files"
                  icon={<FolderOpenOutlined />}
                  onClick={() => open({ kind: 'files', cwd })}
                />
              </Tooltip>
            </>
          )}
          {pane.kind === 'agent' && (
            <>
              <Segmented<View>
                shape="round"
                options={['Chat', 'Terminal', 'Split']}
                value={view}
                onChange={(mode) => setView(key, { mode })}
              />
              <Button
                variant="outlined"
                color="primary"
                onClick={() => void interrupt()}
              >
                Interrupt
              </Button>
            </>
          )}
        </Flex>
      </Flex>
      <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
    </Flex>
  );
}
