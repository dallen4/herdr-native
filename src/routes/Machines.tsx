import { App, Button, Flex, Form, Input, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Display } from '../components/atoms/Display.tsx';
import { Mono } from '../components/atoms/Mono.tsx';
import { useHub } from '../contexts/HubContext.tsx';
import { DEFAULT_BRIDGE_URL } from '../env.ts';
import { DEMO_MACHINE_ID } from '../lib/hub/mock-connection.ts';
import { machineIdFor, normalizeBridgeUrl } from '../lib/machines.ts';
import { palette, radius, space } from '../theme/tokens.ts';

/** Tauri command errors arrive as `{ code, message }`, not Error. */
const messageOf = (error: unknown) =>
  (error as { message?: string })?.message ?? String(error);

interface Health {
  ok: boolean;
  bridge: {
    hostname: string;
    version: string;
    herdr: { version: string; protocol: number } | null;
  };
}

// Connect to herdr servers running devhub-bridge (over the tailnet), or
// run on demo data.
export const MachinesPage = () => {
  const {
    machines,
    activeId,
    selectMachine,
    saveMachine,
    removeMachine,
  } = useHub();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState(DEFAULT_BRIDGE_URL ?? '');
  const [token, setToken] = useState('');
  const [checking, setChecking] = useState(false);

  const use = (id: string) => {
    selectMachine(id);
    navigate('/');
  };

  const add = async () => {
    const base = normalizeBridgeUrl(url);
    setChecking(true);
    try {
      let health: Health;
      try {
        const res = await fetch(`${base}/health`);
        if (!res.ok) throw new Error(`bridge answered ${res.status}`);
        health = (await res.json()) as Health;
      } catch (error) {
        message.error(
          `Couldn't reach a bridge at ${base}: ${(error as Error).message}`,
        );
        return;
      }
      if (!health.bridge.herdr) {
        message.warning(
          'Bridge reachable, but herdr is not running there.',
        );
      }
      const id = machineIdFor(
        label || health.bridge.hostname,
        machines.map((m) => m.id),
      );
      await saveMachine(
        { id, label: label || health.bridge.hostname, url: base },
        token.trim() || null,
      );
      setLabel('');
      setToken('');
      use(id);
    } catch (error) {
      message.error(`Couldn't save ${base}: ${messageOf(error)}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Flex
      vertical
      gap={space.xl}
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: `${space.xxl}px ${space.lg}px`,
      }}
    >
      <Flex vertical gap={space.xs}>
        <Display size={28} weight={700}>
          Machines
        </Display>
        <span style={{ color: palette.textMuted, lineHeight: 1.6 }}>
          devhub connects to herdr servers running devhub-bridge,
          usually published on your tailnet with{' '}
          <Mono>tailscale serve</Mono>.
        </span>
      </Flex>

      {machines.length > 0 && (
        <Flex vertical gap={space.xs}>
          {machines.map((m) => (
            <Flex
              key={m.id}
              align="center"
              gap={space.md}
              style={{
                padding: space.md,
                borderRadius: radius.panel,
                background: palette.card,
                border: `1px solid ${palette.borderStrong}`,
              }}
            >
              <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                <Flex align="center" gap={space.xs}>
                  <Display size={15}>{m.label}</Display>
                  {activeId === m.id && (
                    <Tag color="green" style={{ margin: 0 }}>
                      active
                    </Tag>
                  )}
                </Flex>
                <Mono
                  size={11}
                  faint
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.url}
                </Mono>
              </Flex>
              <Button type="primary" onClick={() => use(m.id)}>
                Open
              </Button>
              <Button
                danger
                type="text"
                onClick={() => void removeMachine(m.id)}
              >
                Remove
              </Button>
            </Flex>
          ))}
        </Flex>
      )}

      <Form
        layout="vertical"
        onFinish={() => void add()}
        style={{
          padding: space.lg,
          borderRadius: radius.panel,
          border: `1px solid ${palette.border}`,
        }}
      >
        <Display
          size={16}
          style={{ display: 'block', marginBottom: space.md }}
        >
          Add a machine
        </Display>
        <Form.Item label="Bridge URL" required>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://studio.tail1234.ts.net/devhub"
          />
        </Form.Item>
        <Form.Item
          label="Label"
          extra="Defaults to the server's hostname."
        >
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Form.Item>
        <Form.Item
          label="Token"
          extra="Only if the bridge sets DEVHUB_BRIDGE_TOKEN. Your own Tailscale login needs none. Stored in the OS keychain."
        >
          <Input.Password
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Form.Item>
        <Flex gap={space.xs}>
          <Button
            type="primary"
            htmlType="submit"
            loading={checking}
            disabled={!url.trim()}
          >
            Connect
          </Button>
          <Button
            color="primary"
            variant="filled"
            onClick={() => use(DEMO_MACHINE_ID)}
          >
            Use demo data
          </Button>
        </Flex>
      </Form>
    </Flex>
  );
};
