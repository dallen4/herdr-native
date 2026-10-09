import type { FileContent, FileEntry } from '@devhub/shared/hub';
import { Drawer, Dropdown, Empty, Flex, Spin, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useState } from 'react';
import { highlightLines, languageFor } from '../../lib/highlight.ts';
import { useIsMobile } from '../../hooks/use-mobile.ts';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { copyText } from '../molecules/ContextMenu.tsx';
import { useConnection } from '../../contexts/HubContext.tsx';
import { useUi } from '../../contexts/UiContext.tsx';
import { fonts, palette, space } from '../../theme/tokens.ts';
import { Mono } from '../atoms/Mono.tsx';

const toNode = (e: FileEntry): DataNode => ({
  key: e.path,
  title: e.name,
  isLeaf: e.kind === 'file',
});

function setChildren(
  nodes: DataNode[],
  key: string,
  children: DataNode[],
): DataNode[] {
  return nodes.map((n) =>
    n.key === key
      ? { ...n, children }
      : n.children
        ? { ...n, children: setChildren(n.children, key, children) }
        : n,
  );
}

function Preview({ file }: { file: FileContent | null }) {
  if (!file) {
    return (
      <Empty
        description="Pick a file"
        style={{ marginTop: space.xxl }}
      />
    );
  }
  if (file.kind === 'image') {
    return (
      <img
        src={file.content}
        alt={file.path}
        style={{ maxWidth: '100%', padding: space.md }}
      />
    );
  }
  if (file.kind !== 'text') {
    return (
      <div style={{ padding: space.lg, color: palette.textFaint }}>
        {file.kind === 'binary'
          ? 'Binary file.'
          : `Too large to preview (${Math.round(file.size / 1024)} KB).`}
      </div>
    );
  }
  return <CodePreview path={file.path} content={file.content} />;
}

function CodePreview({
  path,
  content,
}: {
  path: string;
  content: string;
}) {
  const lines = useMemo(
    () => highlightLines(content, languageFor(path)),
    [path, content],
  );
  return (
    <pre
      className="devhub-code"
      style={{
        margin: 0,
        padding: `${space.md}px 0`,
        fontFamily: fonts.mono,
        fontSize: 12,
        lineHeight: 1.6,
        whiteSpace: 'pre',
      }}
    >
      {lines.map((html, i) => (
        <div key={i} style={{ display: 'flex', minHeight: '1.6em' }}>
          <span
            aria-hidden
            style={{
              flex: '0 0 auto',
              width: 52,
              paddingRight: space.md,
              textAlign: 'right',
              color: palette.textFaint,
              opacity: 0.6,
              userSelect: 'none',
            }}
          >
            {i + 1}
          </span>
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      ))}
    </pre>
  );
}

// Browse a pane's folder and preview files (text, images). Opened from
// the session header, the palette, or a file path in a tool step.
export function FilesDrawer() {
  const connection = useConnection();
  const { overlay, close } = useUi();
  const visible = overlay?.kind === 'files';
  const cwd = overlay?.kind === 'files' ? overlay.cwd : null;
  const initialPath =
    overlay?.kind === 'files' ? overlay.path : undefined;
  const [tree, setTree] = useState<DataNode[]>([]);
  const [file, setFile] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!cwd) return;
    setTree([]);
    setFile(null);
    setError(null);
    connection
      .request('fs.list', { path: cwd })
      .then((entries) => setTree(entries.map(toNode)))
      .catch((e: Error) => setError(e.message));
  }, [connection, cwd]);

  const open = async (path: string) => {
    setLoading(true);
    try {
      setFile(await connection.request('fs.read', { path }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialPath) void open(initialPath);
    // open is stable enough for a one-shot on path change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPath]);

  return (
    <Drawer
      title={
        <Flex vertical>
          <span>Files</span>
          <Mono size={11} faint>
            {file?.path ?? cwd}
          </Mono>
        </Flex>
      }
      open={visible}
      onClose={close}
      size={isMobile ? '100%' : 'min(1100px, 90vw)'}
      styles={{ body: { padding: 0 } }}
      destroyOnHidden
    >
      <Flex style={{ height: '100%' }}>
        {isMobile && file ? (
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => setFile(null)}
              style={{ margin: space.xs }}
            >
              Files
            </Button>
            <Preview file={file} />
          </div>
        ) : (
          <>
            <div
              style={{
                width: isMobile ? '100%' : 280,
                flex: '0 0 auto',
                overflow: 'auto',
                padding: space.sm,
                borderRight: `1px solid ${palette.border}`,
              }}
            >
              <Tree.DirectoryTree
                treeData={tree}
                expandAction="click"
                loadData={async (node) => {
                  const entries = await connection.request(
                    'fs.list',
                    {
                      path: String(node.key),
                    },
                  );
                  setTree((t) =>
                    setChildren(
                      t,
                      String(node.key),
                      entries.map(toNode),
                    ),
                  );
                }}
                onSelect={(_, info) => {
                  if (info.node.isLeaf)
                    void open(String(info.node.key));
                }}
                titleRender={(node) => (
                  <Dropdown
                    trigger={['contextMenu']}
                    menu={{
                      items: [
                        ...(node.isLeaf
                          ? [{ key: 'open', label: 'Open' }]
                          : []),
                        { key: 'copy', label: 'Copy path' },
                        { key: 'copy-name', label: 'Copy name' },
                      ],
                      onClick: ({ key, domEvent }) => {
                        domEvent.stopPropagation();
                        const path = String(node.key);
                        if (key === 'open') void open(path);
                        if (key === 'copy') void copyText(path);
                        if (key === 'copy-name') {
                          void copyText(
                            path.slice(path.lastIndexOf('/') + 1),
                          );
                        }
                      },
                    }}
                  >
                    <span>{String(node.title)}</span>
                  </Dropdown>
                )}
              />
            </div>
            {!isMobile && (
              <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
                {error ? (
                  <div
                    style={{
                      padding: space.lg,
                      color: palette.textFaint,
                    }}
                  >
                    {error}
                  </div>
                ) : loading ? (
                  <Spin style={{ margin: space.xxl }} />
                ) : (
                  <Preview file={file} />
                )}
              </div>
            )}
          </>
        )}
      </Flex>
    </Drawer>
  );
}
