import { App, Form, Input, Modal, Segmented, Select } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection, useHub } from '../../contexts/HubContext.tsx';
import { useUi } from '../../contexts/UiContext.tsx';
import { panePath } from '../../lib/routes.ts';

type Where = 'existing' | 'new';

// Start Claude Code: in a new tab of an existing workspace, or in a new
// workspace rooted at a folder.
export function NewAgentModal() {
  const { snapshot } = useHub();
  const connection = useConnection();
  const { overlay, close } = useUi();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const visible = overlay?.kind === 'newAgent';
  const presetWorkspace =
    overlay?.kind === 'newAgent' ? overlay.workspaceId : undefined;
  const [where, setWhere] = useState<Where>('existing');
  const [workspaceId, setWorkspaceId] = useState<
    string | undefined
  >();
  const [cwd, setCwd] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const first = presetWorkspace ?? snapshot.workspaces[0]?.id;
    setWorkspaceId(first);
    setWhere(first ? 'existing' : 'new');
    setCwd('~/Projects/');
    setLabel('');
  }, [visible, presetWorkspace, snapshot.workspaces]);

  const start = async () => {
    setBusy(true);
    try {
      const { paneId } =
        where === 'existing' && workspaceId
          ? await connection.request('tab.create', {
              workspaceId,
              label: label || undefined,
              agent: 'claude',
            })
          : await connection.request('workspace.create', {
              cwd: cwd.trim(),
              label: label || undefined,
              agent: 'claude',
            });
      close();
      navigate(panePath({ machineId: connection.machineId, paneId }));
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New Claude session"
      open={visible}
      onCancel={close}
      onOk={() => void start()}
      okText="Start"
      confirmLoading={busy}
      okButtonProps={{
        disabled: where === 'new' ? !cwd.trim() : !workspaceId,
      }}
      destroyOnHidden
    >
      <Form layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item>
          <Segmented<Where>
            shape="round"
            value={where}
            onChange={setWhere}
            options={[
              { value: 'existing', label: 'In a workspace' },
              { value: 'new', label: 'New workspace' },
            ]}
          />
        </Form.Item>
        {where === 'existing' ? (
          <Form.Item label="Workspace">
            <Select
              value={workspaceId}
              onChange={setWorkspaceId}
              options={snapshot.workspaces.map((ws) => ({
                value: ws.id,
                label: ws.branch
                  ? `${ws.name} · ${ws.branch}`
                  : ws.name,
              }))}
            />
          </Form.Item>
        ) : (
          <Form.Item
            label="Folder on the server"
            extra="Absolute path or ~/…"
          >
            <Input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="~/Projects/my-app"
            />
          </Form.Item>
        )}
        <Form.Item label="Label (optional)">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              where === 'new' ? 'workspace name' : 'tab name'
            }
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
