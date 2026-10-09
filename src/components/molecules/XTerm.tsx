import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../hooks/use-mobile.ts';
import type { TerminalHandle } from '../../lib/hub/connection.ts';
import {
  ctrlOf,
  PHONE_KEYS as KEYS,
} from '../../lib/terminal-keys.ts';
import type { TerminalMode } from '@devhub/shared/protocol';
import { useConnection } from '../../contexts/HubContext.tsx';
import { fonts, palette, space, status } from '../../theme/tokens.ts';

interface XTermProps {
  paneId: string;
  mode?: TerminalMode;
}

const theme = {
  background: palette.terminal,
  foreground: palette.textSecondary,
  cursor: palette.textSecondary,
  selectionBackground: '#3F3850',
  black: '#1B1722',
  brightBlack: palette.textFaint,
  red: status.error,
  brightRed: status.errorText,
  green: status.done,
  brightGreen: '#C2EA86',
  yellow: status.needsYou,
  brightYellow: '#FFD966',
  blue: status.working,
  brightBlue: palette.blueText,
  magenta: status.worktree,
  brightMagenta: '#C9BCDC',
  cyan: '#5CC8D7',
  brightCyan: '#8BDDE8',
  white: palette.textSecondary,
  brightWhite: palette.text,
};

// A live herdr pane over the bridge. The attach byte stream is the
// truth; xterm keeps no scrollback of its own beyond what herdr sends.
export function XTerm({ paneId, mode = 'interact' }: XTermProps) {
  const connection = useConnection();
  const isMobile = useIsMobile();
  const host = useRef<HTMLDivElement>(null);
  const handleRef = useRef<TerminalHandle | null>(null);
  const ctrlArmed = useRef(false);
  const [ctrl, setCtrl] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setEnded(false);
    const term = new Terminal({
      fontFamily: fonts.mono,
      fontSize: isMobile ? 11.5 : 12.5,
      lineHeight: 1.2,
      cursorBlink: mode === 'interact',
      disableStdin: mode !== 'interact',
      allowProposedApi: true,
      scrollback: 0,
      theme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    // A shell isn't prose: no autocorrect, capitals or suggestions from
    // the iOS keyboard.
    const input = term.textarea;
    if (input) {
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('enterkeyhint', 'send');
    }

    const handle = connection.attachTerminal(
      paneId,
      { cols: term.cols, rows: term.rows, mode },
      {
        onData: (data) => term.write(data),
        onExit: () => setEnded(true),
      },
    );

    handleRef.current = handle;
    term.onData((data) => {
      if (ctrlArmed.current) {
        ctrlArmed.current = false;
        setCtrl(false);
        handle.input(ctrlOf(data));
      } else {
        handle.input(data);
      }
    });
    term.onResize(({ cols, rows }) => handle.resize(cols, rows));

    // Copy on select, and let ⌘/Ctrl+C copy instead of interrupting
    // when there is a selection.
    term.onSelectionChange(() => {
      const text = term.getSelection();
      if (text)
        void navigator.clipboard?.writeText(text).catch(() => {});
    });
    term.attachCustomKeyEventHandler((e) => {
      const copy =
        e.type === 'keydown' &&
        (e.metaKey || e.ctrlKey) &&
        e.key === 'c' &&
        term.hasSelection();
      return !copy;
    });

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // hidden or zero-sized
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      handleRef.current = null;
      handle.detach();
      term.dispose();
    };
  }, [connection, paneId, mode, isMobile]);

  const keyBar = isMobile && mode === 'interact' && (
    <div
      className="no-scrollbar"
      style={{
        display: 'flex',
        gap: space.xxs,
        padding: `${space.xxs}px ${space.xs}px`,
        overflowX: 'auto',
        background: palette.surface,
        borderTop: `1px solid ${palette.border}`,
        flex: '0 0 auto',
      }}
    >
      {[{ label: 'Ctrl', data: '' }, ...KEYS].map((k) => (
        <button
          key={k.label}
          type="button"
          // keep the terminal focused (and the keyboard up)
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (k.label === 'Ctrl') {
              ctrlArmed.current = !ctrlArmed.current;
              setCtrl(ctrlArmed.current);
            } else {
              handleRef.current?.input(k.data);
            }
          }}
          style={{
            flex: '0 0 auto',
            minWidth: 44,
            height: 36,
            padding: `0 ${space.sm}px`,
            border: `1px solid ${palette.borderStrong}`,
            borderRadius: 6,
            font: 'inherit',
            fontFamily: fonts.mono,
            fontSize: 13,
            color:
              k.label === 'Ctrl' && ctrl
                ? palette.ground
                : palette.text,
            background:
              k.label === 'Ctrl' && ctrl
                ? status.done
                : palette.raised,
          }}
        >
          {k.label}
        </button>
      ))}
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          background: palette.terminal,
          padding: `${space.xs}px ${space.md}px`,
          boxSizing: 'border-box',
        }}
      >
        <div ref={host} style={{ height: '100%' }} />
        {ended && (
          <div
            style={{
              position: 'absolute',
              inset: 'auto 0 0 0',
              padding: space.sm,
              textAlign: 'center',
              fontSize: 12,
              color: palette.textFaint,
              background: palette.surface,
            }}
          >
            Terminal ended.
          </div>
        )}
      </div>
      {keyBar}
    </div>
  );
}
