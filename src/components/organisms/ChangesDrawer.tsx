import { ReloadOutlined } from '@ant-design/icons';
import type { GitStatus } from '@devhub/shared/hub';
import { Button, Drawer, Flex, Spin, Tooltip } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useConnection } from '../../contexts/HubContext.tsx';
import { useUi } from '../../contexts/UiContext.tsx';
import {
  fonts,
  palette,
  radius,
  space,
  status,
} from '../../theme/tokens.ts';
import { Mono } from '../atoms/Mono.tsx';
import { ContextMenu, copyText } from '../molecules/ContextMenu.tsx';
import { DiffView } from '../molecules/DiffView.tsx';
import { useIsMobile } from '../../hooks/use-mobile.ts';
import { ArrowLeftOutlined } from '@ant-design/icons';

const REFRESH_MS = 4_000;

const codeColor = (code: string) =>
  code.includes('?') || code.includes('A')
    ? status.done
    : code.includes('D')
      ? status.errorText
      : status.needsYou;

// Review what a session changed: git status on the left, the selected
// file's diff (or everything) on the right. Refreshes while open.
export function ChangesDrawer() {
  const connection = useConnection();
  const { overlay, close, open } = useUi();
  const visible = overlay?.kind === 'changes';
  const cwd = overlay?.kind === 'changes' ? overlay.cwd : null;
  const [git, setGit] = useState<GitStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  // phone: the file list, then a diff with a way back
  const [showDiff, setShowDiff] = useState(false);

  const refresh = useCallback(async () => {
    if (!cwd) return;
    try {
      const next = await connection.request('git.status', { cwd });
      setGit(next);
      setError(null);
      const { diff } = await connection.request('git.diff', {
        cwd: next.root,
        ...(selected ? { path: selected } : {}),
      });
      setDiff(diff);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [connection, cwd, selected]);

  useEffect(() => {
    if (!visible) return;
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [visible, refresh]);

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setGit(null);
      setDiff(null);
      setShowDiff(false);
    }
  }, [visible]);

  return (
    <Drawer
      title={
        <Flex align="center" gap={space.sm}>
          <Flex vertical>
            <span>Changes</span>
            <Mono size={11} faint>
              {git
                ? `${git.root} · ${git.branch ?? 'detached'}`
                : cwd}
            </Mono>
          </Flex>
          <Tooltip title="Refresh">
            <Button
              type="text"
              aria-label="Refresh"
              icon={<ReloadOutlined />}
              onClick={() => void refresh()}
              style={{ marginLeft: 'auto' }}
            />
          </Tooltip>
        </Flex>
      }
      open={visible}
      onClose={close}
      size={isMobile ? '100%' : 'min(1200px, 92vw)'}
      styles={{ body: { padding: 0 } }}
      destroyOnHidden
    >
      {error ? (
        <div style={{ padding: space.lg, color: palette.textFaint }}>
          {error}
        </div>
      ) : !git ? (
        <Spin style={{ margin: space.xxl }} />
      ) : (
        <Flex style={{ height: '100%' }}>
          {isMobile && showDiff ? (
            <Flex vertical style={{ flex: 1, minWidth: 0 }}>
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => setShowDiff(false)}
                style={{ alignSelf: 'flex-start', margin: space.xs }}
              >
                {selected ?? 'All changes'}
              </Button>
              <div style={{ flex: 1, minHeight: 0 }}>
                {diff === null ? (
                  <Spin style={{ margin: space.xxl }} />
                ) : (
                  <DiffView diff={diff} />
                )}
              </div>
            </Flex>
          ) : (
            <>
              <div
                style={{
                  width: isMobile ? '100%' : 300,
                  flex: '0 0 auto',
                  overflow: 'auto',
                  padding: space.sm,
                  borderRight: `1px solid ${palette.border}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setShowDiff(true);
                  }}
                  style={{
                    ...rowStyle,
                    background:
                      selected === null
                        ? palette.raised
                        : 'transparent',
                  }}
                >
                  <span style={{ flex: 1 }}>All changes</span>
                  <Mono size={11} faint>
                    {git.files.length}
                  </Mono>
                </button>
                {git.files.map((f) => (
                  <ContextMenu
                    key={`${f.code}:${f.path}`}
                    items={[
                      {
                        key: 'diff',
                        label: 'Show diff',
                        onClick: () => setSelected(f.path),
                      },
                      {
                        key: 'open',
                        label: 'Open in file viewer',
                        disabled: f.code.includes('D'),
                        onClick: () =>
                          open({
                            kind: 'files',
                            cwd: git.root,
                            path: `${git.root}/${f.path}`,
                          }),
                      },
                      {
                        key: 'copy',
                        label: 'Copy path',
                        divider: true,
                        onClick: () => void copyText(f.path),
                      },
                      {
                        key: 'copy-abs',
                        label: 'Copy absolute path',
                        onClick: () =>
                          void copyText(`${git.root}/${f.path}`),
                      },
                    ]}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(f.path)}
                      title={f.path}
                      style={{
                        ...rowStyle,
                        background:
                          selected === f.path
                            ? palette.raised
                            : 'transparent',
                      }}
                    >
                      <Mono
                        size={11}
                        style={{
                          width: 20,
                          color: codeColor(f.code),
                        }}
                      >
                        {f.code.trim() || 'M'}
                      </Mono>
                      <span
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          direction: 'rtl',
                          textAlign: 'left',
                          fontFamily: fonts.mono,
                          fontSize: 12,
                        }}
                      >
                        {f.path}
                      </span>
                    </button>
                  </ContextMenu>
                ))}
                {git.files.length === 0 && (
                  <div
                    style={{
                      padding: space.sm,
                      color: palette.textFaint,
                    }}
                  >
                    Working tree clean.
                  </div>
                )}
              </div>
              {!isMobile && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  {diff === null ? (
                    <Spin style={{ margin: space.xxl }} />
                  ) : (
                    <DiffView diff={diff} />
                  )}
                </div>
              )}
            </>
          )}
        </Flex>
      )}
    </Drawer>
  );
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
  width: '100%',
  padding: `${space.xs}px ${space.sm}px`,
  border: 0,
  borderRadius: radius.control,
  cursor: 'pointer',
  font: 'inherit',
  color: palette.text,
  textAlign: 'left' as const,
};
