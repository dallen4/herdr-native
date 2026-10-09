import { App, Form, Input, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHub } from '../../contexts/HubContext.tsx';
import { useUi } from '../../contexts/UiContext.tsx';
import { browserPath } from '../../lib/browser.ts';

const NONE = '__none__';

// Open a browser tab, anchored to a workspace (so it sits with that
// workspace's agent and shells) or free-standing.
export function NewBrowserTabModal() {
  const { snapshot, connection } = useHub();
  const { overlay, close } = useUi();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const visible = overlay?.kind === 'newBrowser';
  const preset = overlay?.kind === 'newBrowser' ? overlay : undefined;
  const [input, setInput] = useState('');
  const [workspaceId, setWorkspaceId] = useState(NONE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setInput('github.com/');
    setWorkspaceId(preset?.workspaceId ?? NONE);
  }, [visible, preset?.workspaceId]);

  const submit = async () => {
    if (!input.trim() || !connection) return;
    setBusy(true);
    try {
      const tab = await connection.request('browser.open', {
        url: input,
        ...(workspaceId !== NONE
          ? { workspaceId, paneId: preset?.paneId }
          : {}),
      });
      close();
      navigate(browserPath(tab.id));
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New browser tab"
      open={visible}
      onCancel={close}
      onOk={() => void submit()}
      okText="Open"
      confirmLoading={busy}
      destroyOnHidden
    >
      <Form layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item label="Address">
          <Input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={() => void submit()}
            placeholder="URL, or words to search"
          />
        </Form.Item>
        <Form.Item label="Keep with">
          <Select
            value={workspaceId}
            onChange={setWorkspaceId}
            options={[
              {
                value: NONE,
                label: 'No workspace (Browser section)',
              },
              ...snapshot.workspaces.map((ws) => ({
                value: ws.id,
                label: ws.name,
              })),
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
