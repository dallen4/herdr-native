import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ExportOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  loadableUrl,
  RAW_SANDBOX,
  toUrl,
} from '@devhub/shared/browser';
import { FILE_URL_PREFIX } from '@devhub/shared/hub';
import type { BrowserTab } from '@devhub/shared/hub';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Button, Flex, Input, Tooltip } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useHub } from '../../contexts/HubContext.tsx';
import { useUi } from '../../contexts/UiContext.tsx';
import { appFor, openLink } from '../../lib/deeplink.ts';
import { isTouchDevice } from '../../lib/native.ts';
import * as native from '../../lib/native-browser.ts';
import { copyText } from '../molecules/ContextMenu.tsx';
import { Display } from '../atoms/Display.tsx';
import { Mono } from '../atoms/Mono.tsx';
import { fonts, palette, radius, space } from '../../theme/tokens.ts';

const URL_POLL_MS = 1500;

export function BrowserView({
  tab,
  compact = false,
}: {
  tab: BrowserTab;
  /** Inside a split: a slimmer toolbar. */
  compact?: boolean;
}) {
  const { connection, bridgeUrl } = useHub();
  const { overlay } = useUi();
  const area = useRef<HTMLDivElement>(null);
  const [address, setAddress] = useState(tab.url);
  const inTauri = native.nativeBrowser();
  // On a phone, web pages hand off to the app or Safari (sites refuse
  // iframes, and iOS has no embedded webview pane); server files still
  // render in place.
  const handOff =
    isTouchDevice() && !tab.url.startsWith(FILE_URL_PREFIX);
  // Server files load through the bridge; demo mode has no bridge.
  const loadable = loadableUrl(tab.url, bridgeUrl ?? '');
  const [frameUrl, setFrameUrl] = useState(loadable);

  useEffect(() => setAddress(tab.url), [tab.url]);
  useEffect(() => setFrameUrl(loadable), [loadable]);

  const save = (url: string) =>
    connection
      ?.request('browser.update', { id: tab.id, url })
      .catch(() => {});

  // Keep the native webview glued to the pane; hide it under overlays
  // and when the pane goes away (it stays alive for next time).
  useEffect(() => {
    if (!inTauri) return;
    const el = area.current;
    if (!el) return;
    const sync = () => {
      if (overlay) {
        void native.hide(tab.id);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      void native.place(tab.id, loadable, {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      void native.hide(tab.id);
    };
    // the URL only seeds a webview on creation; later navigation goes
    // through native.navigate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inTauri, tab.id, overlay]);

  // Follow link clicks inside the page (web URLs only; a bridge-served
  // file keeps its devhub-file:// identity).
  useEffect(() => {
    if (!inTauri) return;
    const timer = setInterval(() => {
      if (!native.exists(tab.id)) return;
      native
        .currentUrl(tab.id)
        .then((url) => {
          if (url !== loadable && !url.includes('/raw?path=')) {
            void save(url);
          }
        })
        .catch(() => {});
    }, URL_POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inTauri, tab.id, loadable]);

  const go = (input: string) => {
    const url = toUrl(input);
    void save(url);
    const target = loadableUrl(url, bridgeUrl ?? '');
    if (inTauri) void native.navigate(tab.id, target).catch(() => {});
    else setFrameUrl(target);
  };

  const historyAction = (action: 'back' | 'forward' | 'reload') => {
    if (inTauri) void native.history(tab.id, action).catch(() => {});
    else if (action === 'reload') setFrameUrl(`${loadable}`);
  };

  const external = () =>
    inTauri
      ? void openUrl(loadable)
      : void window.open(loadable, '_blank', 'noopener');

  if (handOff) {
    const app = appFor(tab.url);
    return (
      <Flex
        vertical
        align="center"
        justify="center"
        gap={space.md}
        style={{
          height: '100%',
          padding: space.xl,
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 40 }} aria-hidden>
          🌐
        </span>
        <Display size={18} style={{ wordBreak: 'break-word' }}>
          {tab.title}
        </Display>
        <Mono
          size={11.5}
          faint
          style={{ wordBreak: 'break-all', maxWidth: 420 }}
        >
          {tab.url}
        </Mono>
        <Button
          type="primary"
          size="large"
          onClick={() => void openLink(tab.url)}
          style={{ minWidth: 220, marginTop: space.sm }}
        >
          {app ? `Open in ${app}` : 'Open in Safari'}
        </Button>
        <Button
          color="primary"
          variant="filled"
          onClick={() => void copyText(tab.url)}
          style={{ minWidth: 220 }}
        >
          Copy link
        </Button>
        <span
          style={{
            fontSize: 12,
            color: palette.textFaint,
            maxWidth: 320,
          }}
        >
          {app
            ? `Opens the ${app} app if it's installed, otherwise Safari.`
            : 'Opens in your browser, or the matching app if one handles this link.'}
        </span>
      </Flex>
    );
  }

  return (
    <Flex vertical style={{ height: '100%', minHeight: 0 }}>
      <Flex
        align="center"
        gap={space.xxs}
        style={{
          padding: compact
            ? `${space.xs}px ${space.sm}px`
            : `${space.sm}px ${space.lg}px`,
          borderBottom: `1px solid ${palette.border}`,
        }}
      >
        <Tooltip title="Back">
          <Button
            type="text"
            size={compact ? 'small' : 'middle'}
            aria-label="Back"
            icon={<ArrowLeftOutlined />}
            disabled={!inTauri}
            onClick={() => historyAction('back')}
          />
        </Tooltip>
        <Tooltip title="Forward">
          <Button
            type="text"
            size={compact ? 'small' : 'middle'}
            aria-label="Forward"
            icon={<ArrowRightOutlined />}
            disabled={!inTauri}
            onClick={() => historyAction('forward')}
          />
        </Tooltip>
        <Tooltip title="Reload">
          <Button
            type="text"
            size={compact ? 'small' : 'middle'}
            aria-label="Reload"
            icon={<ReloadOutlined />}
            onClick={() => historyAction('reload')}
          />
        </Tooltip>
        <Input
          aria-label="Address"
          variant="filled"
          size={compact ? 'small' : 'middle'}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onPressEnter={() => go(address)}
          onFocus={(e) => e.target.select()}
          style={{
            flex: 1,
            marginInline: space.xxs,
            fontFamily: fonts.mono,
            fontSize: 12.5,
            borderRadius: radius.pill,
          }}
        />
        <Tooltip title="Open in your browser">
          <Button
            type="text"
            size={compact ? 'small' : 'middle'}
            aria-label="Open in your browser"
            icon={<ExportOutlined />}
            onClick={external}
          />
        </Tooltip>
      </Flex>
      <div
        ref={area}
        style={{ flex: 1, minHeight: 0, background: '#fff' }}
      >
        {!inTauri && (
          <iframe
            key={frameUrl}
            title={tab.title}
            src={frameUrl}
            // Server files come from the bridge's origin, which in the
            // web build is the app's own; keep them off it (the bridge
            // also sends a sandbox CSP on /raw).
            sandbox={
              tab.url.startsWith(FILE_URL_PREFIX)
                ? RAW_SANDBOX
                : undefined
            }
            style={{ width: '100%', height: '100%', border: 0 }}
          />
        )}
      </div>
      {!inTauri && !compact && (
        <div
          style={{
            padding: `${space.xs}px ${space.lg}px`,
            fontSize: 11.5,
            color: palette.textFaint,
            background: palette.surface,
          }}
        >
          In a plain browser this pane is an iframe, and many sites
          refuse to load in one. The desktop app uses a real webview.
        </div>
      )}
    </Flex>
  );
}
