import { MenuOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Flex } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useHub } from '../../contexts/HubContext.tsx';
import { useUi } from '../../contexts/UiContext.tsx';
import { useAppInfo } from '../../hooks/use-app-info.ts';
import { useIsMobile } from '../../hooks/use-mobile.ts';
import { inTauri, isMacDesktop } from '../../lib/native.ts';
import { panePath } from '../../lib/routes.ts';
import {
  fonts,
  palette,
  radius,
  space,
  status as statusColors,
} from '../../theme/tokens.ts';
import { BrandMark } from '../atoms/BrandMark.tsx';
import { Display } from '../atoms/Display.tsx';
import { Mono } from '../atoms/Mono.tsx';
import { StatusDot } from '../atoms/StatusDot.tsx';
import { StatusPill } from '../atoms/StatusPill.tsx';
import { UsageMeter } from '../molecules/UsageMeter.tsx';

// With titleBarStyle "Overlay" the macOS traffic lights sit on top of
// the webview; leave room for them and make the bar draggable.
const TRAFFIC_LIGHTS_INSET = 84;

const CONNECTION_COLOR = {
  online: statusColors.done,
  connecting: statusColors.needsYou,
  offline: statusColors.error,
};

function MobileTopBar() {
  const { counts, status, activeId } = useHub();
  const { open, setNavOpen, setSheetOpen } = useUi();
  const navigate = useNavigate();

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space.xs,
        height: 52,
        flex: '0 0 auto',
        paddingInline: space.xs,
        borderBottom: `1px solid ${palette.border}`,
      }}
    >
      {activeId && (
        <Button
          type="text"
          aria-label="Workspaces"
          icon={<MenuOutlined />}
          onClick={() => setNavOpen(true)}
          style={{ width: 44, height: 44 }}
        />
      )}
      <Flex
        align="center"
        gap={space.xs}
        style={{ flex: 1, minWidth: 0 }}
      >
        <BrandMark size={20} />
        <Display size={17} weight={700}>
          devhub
        </Display>
      </Flex>
      {activeId && (
        <>
          <Button
            type="text"
            aria-label="Search"
            icon={<SearchOutlined />}
            onClick={() => open({ kind: 'palette' })}
            style={{ width: 44, height: 44 }}
          />
          <StatusPill
            urgent={counts.needsYou > 0}
            onClick={() => setSheetOpen(true)}
          >
            {counts.needsYou > 0 ? (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#241A00',
                }}
              />
            ) : (
              <StatusDot status="working" size={7} />
            )}
            {counts.needsYou > 0 ? counts.needsYou : counts.working}
          </StatusPill>
        </>
      )}
      <button
        type="button"
        aria-label="Machines"
        onClick={() => navigate('/machines')}
        style={{
          width: 36,
          height: 44,
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          color: activeId
            ? CONNECTION_COLOR[status]
            : statusColors.idle,
        }}
      >
        ●
      </button>
    </header>
  );
}

export function TopBar() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileTopBar /> : <DesktopTopBar />;
}

function DesktopTopBar() {
  const { snapshot, counts, attention, status, activeId } = useHub();
  const { open } = useUi();
  const navigate = useNavigate();
  const appInfo = useAppInfo();
  const machine = snapshot.machines[0];
  const inset =
    inTauri() && isMacDesktop() ? TRAFFIC_LIGHTS_INSET : space.lg;

  return (
    <header
      data-tauri-drag-region
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space.lg,
        height: 64,
        flex: '0 0 auto',
        paddingInline: `${inset}px ${space.lg}px`,
        borderBottom: `1px solid ${palette.border}`,
      }}
    >
      <Flex align="center" gap={space.sm} data-tauri-drag-region>
        <BrandMark size={24} />
        <Display size={19} weight={700}>
          devhub
        </Display>
      </Flex>

      {activeId && (
        <button
          type="button"
          onClick={() => open({ kind: 'palette' })}
          style={{
            flex: '1 1 320px',
            maxWidth: 560,
            height: 38,
            marginLeft: space.md,
            display: 'flex',
            alignItems: 'center',
            gap: space.sm,
            padding: `0 ${space.sm}px`,
            cursor: 'text',
            textAlign: 'left',
            fontFamily: fonts.mono,
            fontSize: 12.5,
            color: palette.textFaint,
            background: '#1E1A26',
            border: 0,
            borderLeft: `2px solid ${palette.blue}`,
            borderRadius: radius.control,
          }}
        >
          <span>$</span>
          <span className="devhub-ellipsis" style={{ flex: 1 }}>
            jump to a pane, run an action, or start an agent
          </span>
          <span style={{ fontSize: 11 }}>⌘K</span>
        </button>
      )}

      <div
        data-tauri-drag-region
        style={{ flex: 1, alignSelf: 'stretch' }}
      />

      {activeId && (
        <Flex align="center" gap={space.xs}>
          <UsageMeter />
          <StatusPill>
            <StatusDot status="working" size={7} />
            {counts.working} working
          </StatusPill>
          {counts.needsYou > 0 && (
            <StatusPill
              urgent
              onClick={() => {
                const next = attention[0]?.pane;
                if (next) navigate(panePath(next));
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#241A00',
                }}
              />
              {counts.needsYou} need you
            </StatusPill>
          )}
          {counts.failing > 0 && (
            <StatusPill>
              <StatusDot status="error" size={7} />
              {counts.failing} failing
            </StatusPill>
          )}
        </Flex>
      )}

      <button
        type="button"
        onClick={() => navigate('/machines')}
        title="Machines"
        style={{
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <Mono size={11} faint style={{ whiteSpace: 'nowrap' }}>
          {activeId
            ? `${machine?.label ?? activeId}${
                machine ? ` · herdr ${machine.herdrVersion}` : ''
              }`
            : 'no machine'}
          {appInfo ? ` · v${appInfo.version}` : ''}{' '}
          <span
            style={{
              color: activeId
                ? CONNECTION_COLOR[status]
                : statusColors.idle,
            }}
          >
            ●
          </span>
        </Mono>
      </button>
    </header>
  );
}
